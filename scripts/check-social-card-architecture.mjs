import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const runtimeRoots = ['server', 'pages', 'components', 'composables', 'layouts', 'lib', 'shared', 'utils']
const legacyPatterns = [
  /og-image-render\.png/,
  /parseOgImageQuery/,
  /computeOgImageCacheKey/,
  /resolveSocialOgImage/,
]

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return /\.(?:ts|tsx|vue|js|mjs)$/.test(entry.name) ? [target] : []
  })
}

const failures = []
const regenerationCallers = []
for (const runtimeRoot of runtimeRoots) {
  const directory = path.join(root, runtimeRoot)
  if (!fs.existsSync(directory)) continue
  for (const file of sourceFiles(directory)) {
    const source = fs.readFileSync(file, 'utf8')
    if (/regenerateSiteSocialCards\s*\(/.test(source)) regenerationCallers.push(path.relative(root, file).replaceAll('\\', '/'))
    for (const pattern of legacyPatterns) {
      if (pattern.test(source)) failures.push(`${path.relative(root, file)} references ${pattern.source}`)
    }
  }
}

const allowedRegenerationCallers = new Set([
  'server/api/admin/platform/social-cards/regenerate.post.ts',
  'server/api/editor/sites/[siteId]/social-cards/regenerate.post.ts',
  'server/utils/social-card.ts',
])
for (const caller of regenerationCallers) {
  if (!allowedRegenerationCallers.has(caller)) failures.push(`${caller} performs an automatic full-site social-card sweep`)
}

const metadataComposable = fs.readFileSync(path.join(root, 'composables/useSocialMetadata.ts'), 'utf8')
if (/ownerMedia/.test(metadataComposable)) failures.push('useSocialMetadata must consume an already-resolved socialImage')
if (/brand\.logoUrl/.test(metadataComposable)) failures.push('useSocialMetadata must not reconstruct a browser-side logo fallback')

const metadataContract = fs.readFileSync(path.join(root, 'utils/social-metadata.ts'), 'utf8')
for (const legacyField of ['faviconUrl', 'primaryColor', 'secondaryColor', 'heroImage']) {
  if (metadataContract.includes(legacyField)) failures.push(`social metadata contract still exposes ignored ${legacyField}`)
}

const publicShell = fs.readFileSync(path.join(root, 'server/utils/public-shell-query.ts'), 'utf8')
if (/media:\s*\[[\s\S]*?slot:\s*['"]social_card['"]/.test(publicShell)) {
  failures.push('public shell display media must not contain social_card')
}

const socialCardManager = fs.readFileSync(path.join(root, 'server/utils/social-card.ts'), 'utf8')
if (!/product_type\s*=\s*['"]standard['"]/.test(socialCardManager)) {
  failures.push('site regeneration must not enumerate Experience rows as Products')
}

const tenantPages = fs.readFileSync(path.join(root, 'server/utils/tenant-pages.ts'), 'utf8')
if (!/path === ['"]\/['"][\s\S]{0,200}owner_type: ['"]site['"]/.test(tenantPages)) {
  failures.push('homepage tenant-page writes must refresh the site social card')
}

const siteReviews = fs.readFileSync(path.join(root, 'server/utils/site-reviews.ts'), 'utf8')
if (!/review\?\.status === ['"]approved['"][\s\S]{0,200}refreshSocialCard/.test(siteReviews)) {
  failures.push('owner-entered review updates must only refresh approved review cards')
}

const copyPaste = fs.readFileSync(path.join(root, 'server/utils/copy-paste.ts'), 'utf8')
if (!/createLocation\([\s\S]{0,300}refreshSocialCardAfterCreate: false/.test(copyPaste)) {
  failures.push('new-location copy must defer card generation until copied content is committed')
}

const placementContract = fs.readFileSync(path.join(root, 'shared/media-placement-contract.ts'), 'utf8')
if (!/slot\s*!==\s*['"]social_card['"]/.test(placementContract)) {
  failures.push('shared/media-placement-contract.ts must reject social_card from editable placements')
}

const postManager = fs.readFileSync(path.join(root, 'server/utils/post-management.ts'), 'utf8')
const postInput = postManager.match(/export interface PostMediaInput\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
if (/social_card/.test(postInput)) failures.push('PostMediaInput must not accept social_card')

const siteTypes = fs.readFileSync(path.join(root, 'server/types/site.ts'), 'utf8')
if (/slot:\s*['"]logo['"]\s*\|\s*['"]favicon['"]\s*\|\s*['"]social_share['"]\s*\|\s*['"]social_card['"]/.test(siteTypes)) {
  failures.push('Site settings media input must not accept social_card')
}

if (failures.length) {
  console.error(`Social card architecture guard failed:\n${failures.map(item => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Social card architecture guard passed')
