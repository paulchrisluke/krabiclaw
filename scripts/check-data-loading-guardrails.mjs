import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const dashboardRoots = [
  'pages/dashboard',
  'components/workspace',
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
]
const violations = []
const prohibitedLegacyPaths = [
  'composables/useBootstrap.ts',
  'composables/useBootstrapParams.ts',
  'composables/loadPublicBootstrapPayload.ts',
  'server/utils/public-bootstrap.ts',
  'server/api/public/sites/[siteId]/bootstrap.get.ts',
  'server/api/public/drafts/[draftId]/bootstrap.get.ts',
]

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
    if (source.includes('globalThis.$fetch')) {
      violations.push(`${file}: mutates or references globalThis.$fetch`)
    }
    for (const match of source.matchAll(/\bretry\s*:\s*([^,\n}]+)/g)) {
      if (match[1].trim() !== '0') {
        violations.push(`${file}: app-owned fetch retry must be 0 (found ${match[1].trim()})`)
      }
    }
  }
}

for (const path of prohibitedLegacyPaths) {
  const source = await readFile(join(root, path), 'utf8').catch(error => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (source !== null) violations.push(`${path}: legacy data-loading path must remain deleted`)
}

for (const directory of dashboardRoots) {
  for (const file of await filesUnder(directory)) {
    const source = await readFile(join(root, file), 'utf8')
    // Skip DashboardAccountMenu.vue for /api/health platform health check
    if (file === 'components/workspace/dashboard/DashboardAccountMenu.vue') continue
    if (/\$fetch(?:<|\()/.test(source)) {
      violations.push(`${file}: use dashboardFetch for route-scoped API traffic`)
    }
    if (/\bfetch\s*\(\s*['"`]\/api\//.test(source)) {
      violations.push(`${file}: use dashboardFetch for route-scoped API traffic`)
    }
  }
}

for (const directory of adminRoots) {
  for (const file of await filesUnder(directory)) {
    const source = await readFile(join(root, file), 'utf8')
    if (/\$fetch(?:<|\()/.test(source) || /\bdashboardFetch(?:<|\()/.test(source)) {
      violations.push(`${file}: use applicationFetch for unscoped admin API traffic`)
    }
  }
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exitCode = 1
} else {
  console.log('Data-loading guardrails passed')
}
