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
for (const runtimeRoot of runtimeRoots) {
  const directory = path.join(root, runtimeRoot)
  if (!fs.existsSync(directory)) continue
  for (const file of sourceFiles(directory)) {
    const source = fs.readFileSync(file, 'utf8')
    for (const pattern of legacyPatterns) {
      if (pattern.test(source)) failures.push(`${path.relative(root, file)} references ${pattern.source}`)
    }
  }
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
