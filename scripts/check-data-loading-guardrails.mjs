import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import {
  PROHIBITED_LEGACY_PATHS,
  CANONICAL_LOADER_PATHS,
  checkGlobalFetchAndRetry,
  checkBannedSilentEmptySuccessNames,
  checkSilentEmptyCatch,
  checkLegacyFallbackFlag,
  checkDashboardFetchUsage,
  checkAdminFetchUsage,
} from './lib/data-loading-guardrails.mjs'

const root = new URL('..', import.meta.url).pathname
const dashboardRoots = [
  'pages/dashboard',
  'lib/components/workspace',
]
const adminRoots = ['pages/admin', 'components/admin']
const applicationRoots = [
  'composables',
  'layouts',
  'middleware',
  'plugins',
  'utils',
  'pages',
  'components',
  'lib/components',
]
const violations = []

async function filesUnder(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return []
    throw error
  })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(path))
    else if (['.ts', '.tsx', '.vue'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

for (const directory of applicationRoots) {
  for (const file of await filesUnder(directory)) {
    const source = await readFile(join(root, file), 'utf8')
    violations.push(...checkGlobalFetchAndRetry(file, source))
    violations.push(...checkBannedSilentEmptySuccessNames(file, source))
    violations.push(...checkLegacyFallbackFlag(file, source))
  }
}

// server/ isn't part of applicationRoots (that list is Nuxt app-side code), but
// the canonical SSR loaders below live under server/utils — check them for the
// same legacy-fallback-flag pattern.
for (const path of CANONICAL_LOADER_PATHS) {
  if (!path.startsWith('server/')) continue
  const source = await readFile(join(root, path), 'utf8').catch(error => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (source === null) continue
  violations.push(...checkLegacyFallbackFlag(path, source))
}

for (const path of PROHIBITED_LEGACY_PATHS) {
  const source = await readFile(join(root, path), 'utf8').catch(error => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (source !== null) violations.push(`${path}: legacy data-loading path must remain deleted`)
}

for (const path of CANONICAL_LOADER_PATHS) {
  const source = await readFile(join(root, path), 'utf8').catch(error => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (source === null) continue
  violations.push(...checkSilentEmptyCatch(path, source))
}

for (const directory of dashboardRoots) {
  for (const file of await filesUnder(directory)) {
    const source = await readFile(join(root, file), 'utf8')
    // Skip DashboardAccountMenu.vue for /api/health platform health check
    if (file === 'lib/components/workspace/dashboard/DashboardAccountMenu.vue') continue
    violations.push(...checkDashboardFetchUsage(file, source))
  }
}

for (const directory of adminRoots) {
  for (const file of await filesUnder(directory)) {
    const source = await readFile(join(root, file), 'utf8')
    violations.push(...checkAdminFetchUsage(file, source))
  }
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exitCode = 1
} else {
  console.log('Data-loading guardrails passed')
}
