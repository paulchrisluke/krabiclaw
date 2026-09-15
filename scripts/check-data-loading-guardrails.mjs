import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANONICAL_LOADER_PATHS,
  checkGlobalFetchAndRetry,
  checkSilentEmptyCatch,
  checkDashboardFetchUsage,
  checkSsrRequestEventCapture,
  checkDeleteBodyUsage,
  checkDynamicSqlListBindings,
} from './lib/data-loading-guardrails.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dashboardRoots = [
  'pages/dashboard',
  'lib/components/workspace',
]
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
    violations.push(...checkSsrRequestEventCapture(file, source))
  }
}

for (const file of await filesUnder('server/api')) {
  if (!file.endsWith('.delete.ts')) continue
  const source = await readFile(join(root, file), 'utf8')
  violations.push(...checkDeleteBodyUsage(file, source))
}

for (const file of await filesUnder('server')) {
  const source = await readFile(join(root, file), 'utf8')
  violations.push(...checkDynamicSqlListBindings(file, source))
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
    if (file.replaceAll('\\', '/') === 'lib/components/workspace/dashboard/DashboardAccountMenu.vue') continue
    violations.push(...checkDashboardFetchUsage(file, source))
  }
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exitCode = 1
} else {
  console.log('Data-loading guardrails passed')
}
