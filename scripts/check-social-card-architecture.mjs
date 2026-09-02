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

const placementContract = fs.readFileSync(path.join(root, 'shared/media-placement-contract.ts'), 'utf8')
if (!/slot\s*!==\s*['"]social_card['"]/.test(placementContract)) {
  failures.push('shared/media-placement-contract.ts must reject social_card from editable placements')
}

if (failures.length) {
  console.error(`Social card architecture guard failed:\n${failures.map(item => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Social card architecture guard passed')
