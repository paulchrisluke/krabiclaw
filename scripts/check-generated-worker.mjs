import fs from 'node:fs'
import path from 'node:path'

const serverRoot = path.resolve('.output/server')
const forbiddenSpecifiers = ['nitropack/runtime', '@nuxt/devalue']
const forbiddenGeneratedConfigs = [
  '.wrangler/deploy/config.json',
  '.output/server/wrangler.json',
]

const generatedConfigMatches = forbiddenGeneratedConfigs.filter(filePath => fs.existsSync(filePath))
if (generatedConfigMatches.length > 0) {
  throw new Error([
    'Nitro cloudflare.deployConfig must remain false.',
    'Redirected generated Wrangler configurations are forbidden.',
    `Remove: ${generatedConfigMatches.join(', ')}`,
  ].join('\n'))
}

const wranglerConfigPath = path.resolve('wrangler.toml')
if (!fs.existsSync(wranglerConfigPath)) {
  throw new Error(`Root Wrangler configuration is missing: ${wranglerConfigPath}`)
}

const wranglerConfig = fs.readFileSync(wranglerConfigPath, 'utf8')
if (!/^\s*main\s*=\s*["']\.output\/server\/index\.mjs["']\s*$/m.test(wranglerConfig)) {
  throw new Error('Root Wrangler main must be .output/server/index.mjs')
}

if (!fs.existsSync(serverRoot)) {
  throw new Error(`Generated Worker directory is missing: ${serverRoot}`)
}

const matches = []

function importPattern(specifier) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:from\\s*|import\\s*(?:\\(\\s*)?)['"]${escaped}['"]`)
}

function scanDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      scanDirectory(entryPath)
      continue
    }

    if (!/\.(?:cjs|js|mjs)$/.test(entry.name)) {
      continue
    }

    const contents = fs.readFileSync(entryPath, 'utf8')
    for (const specifier of forbiddenSpecifiers) {
      if (importPattern(specifier).test(contents)) {
        matches.push(`${path.relative(process.cwd(), entryPath)} contains ${specifier}`)
      }
    }
  }
}

scanDirectory(serverRoot)

if (matches.length > 0) {
  throw new Error(`Generated Worker contains legacy framework imports:\n${matches.join('\n')}`)
}

console.log(`Generated Worker contains no legacy framework imports: ${serverRoot}`)
