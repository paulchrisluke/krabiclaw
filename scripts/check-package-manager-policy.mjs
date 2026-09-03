import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnYarn } from './utils/spawn-yarn.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageManager = 'yarn@4.18.0+sha512.595f47fbf3bc04f1253bb18aceb2a2a53b4236df3f80109425a34010ec3853fc76935eda663b1e633965e10869644e3122c12fa3c6cae8abe386c5ee1eb7253e'
const nodeVersion = '24.18.1'

const PACKAGE_GRAPHS = [
  {
    name: 'application',
    directory: '.',
    manifest: 'package.json',
    lockfile: 'yarn.lock',
    dependenciesMeta: { 'better-sqlite3': { built: true } },
  },
  {
    name: 'email Worker',
    directory: 'workers/email-inbound',
    manifest: 'workers/email-inbound/package.json',
    lockfile: 'workers/email-inbound/yarn.lock',
    dependenciesMeta: {},
  },
]

const expectedYarnConfig = `nodeLinker: node-modules
npmRegistryServer: "https://registry.npmjs.org"
npmMinimalAgeGate: "7d"
npmPreapprovedPackages: []
enableScripts: false
checksumBehavior: throw
`

const scannedRoots = [
  { path: '.claude', extensions: new Set(['.json']) },
  { path: '.github/workflows', extensions: new Set(['.yml', '.yaml']) },
  { path: 'scripts', extensions: new Set(['.js', '.cjs', '.mjs', '.ts', '.sh']) },
]
const scannedFiles = [
  'package.json',
  'workers/email-inbound/package.json',
  'README.md',
  'docs/perf-cache-verification.md',
  'docs/operations/node-runtime-upgrades.md',
]

function fail(message) {
  console.error(`Package security policy violation: ${message}`)
  process.exitCode = 1
}

function readRepositoryFile(path) {
  return readFileSync(join(repositoryRoot, path), 'utf8').replaceAll('\r\n', '\n')
}

function collectFiles(root, extensions) {
  const directory = join(repositoryRoot, root)
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && extensions.has(extname(entry.name)))
    .map(entry => relative(repositoryRoot, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
}

for (const graph of PACKAGE_GRAPHS) {
  const manifest = JSON.parse(readRepositoryFile(graph.manifest))
  if (manifest.packageManager !== packageManager) {
    fail(`${graph.name} must pin ${packageManager}`)
  }
  if (manifest.engines?.node !== nodeVersion) {
    fail(`${graph.name} must require Node ${nodeVersion}`)
  }
  if (JSON.stringify(manifest.dependenciesMeta ?? {}) !== JSON.stringify(graph.dependenciesMeta)) {
    fail(`${graph.name} must keep its reviewed dependency build allowlist`)
  }

  const lockfile = readRepositoryFile(graph.lockfile)
  if (!lockfile.includes('\n__metadata:\n') || !/^ {2}version: 10$/m.test(lockfile)) {
    fail(`${graph.name} must use a Yarn 4 lockfile`)
  }
}

if (readRepositoryFile('.yarnrc.yml') !== expectedYarnConfig) {
  fail('.yarnrc.yml must keep the canonical seven-day, checksum, script, registry, and node-modules policy')
}

const executableFiles = scannedRoots
  .flatMap(({ path, extensions }) => collectFiles(path, extensions))
  .filter(path => path !== 'scripts/check-package-manager-policy.mjs')
for (const path of [...executableFiles, ...scannedFiles]) {
  const source = readRepositoryFile(path)
  if (/\bnpx(?:\.cmd)?\b/.test(source)) {
    fail(`${path} invokes npx instead of a locked Yarn binary`)
  }
  if (/--frozen-lockfile\b/.test(source)) {
    fail(`${path} uses the legacy frozen-lockfile flag instead of --immutable`)
  }
}

if (process.exitCode) process.exit(process.exitCode)
console.log(`Package security policy verified for ${PACKAGE_GRAPHS.length} package graphs.`)

if (process.argv.includes('--audit')) {
  let auditFailed = false
  for (const graph of PACKAGE_GRAPHS) {
    console.log(`Auditing ${graph.name} dependencies.`)
    const result = spawnYarn(
      ['--cwd', graph.directory, 'npm', 'audit', '--all', '--recursive', '--severity', 'high'],
      { stdio: 'inherit' },
    )
    if (result.error) throw result.error
    if (result.status !== 0) auditFailed = true
  }
  if (auditFailed) process.exit(1)
}
