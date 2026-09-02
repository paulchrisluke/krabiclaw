import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const environment = process.argv[2] ?? 'production'
if (!['preview', 'staging', 'production'].includes(environment)) {
  throw new Error('Usage: node scripts/deploy-worker-ci.mjs [preview|staging|production]')
}

const token = process.env.CLOUDFLARE_API_TOKEN
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
if (!token || !accountId) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required')

const config = await readFile('wrangler.toml', 'utf8')
const environmentHeader = `[env.${environment}]`
const environmentStart = environment === 'production' ? 0 : config.indexOf(environmentHeader)
if (environmentStart < 0) throw new Error(`Missing ${environmentHeader} in wrangler.toml`)
const sectionTailStart = environment === 'production' ? environmentStart : environmentStart + environmentHeader.length
const nextEnvironment = config.slice(sectionTailStart).search(/\n\[env\./)
const sectionEnd = nextEnvironment < 0 ? config.length : sectionTailStart + nextEnvironment
const section = config.slice(environmentStart, sectionEnd)
const expectedRoutes = [...section.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map(match => match[1])
if (expectedRoutes.length === 0) throw new Error(`No routes found for ${environment} in wrangler.toml`)

const args = ['wrangler', 'deploy', '--strict']
if (environment !== 'production') args.push('--env', environment)
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const child = spawn(command, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', chunk => {
    const text = chunk.toString()
    output += text
    process.stdout.write(text)
  })
}
const exitCode = await new Promise(resolve => child.on('close', resolve))
if (exitCode !== 0) process.exit(exitCode ?? 1)

const unsafeWarning = /fallback value|not have access to all zones|(?:could not|unable to|failed to).*(?:delete|reconcile).*route|route.*(?:will not|cannot|could not).*delete/i
if (unsafeWarning.test(output)) throw new Error('Wrangler reported a route fallback or unreconciled route; deployment rejected')

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const api = async (path) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers })
  const body = await response.json()
  if (!response.ok || body.success !== true) {
    throw new Error(`Cloudflare API check failed for ${path}: ${JSON.stringify(body.errors ?? body)}`)
  }
  return body.result
}

const zones = await api(`/zones?name=krabiclaw.com&account.id=${encodeURIComponent(accountId)}`)
if (!Array.isArray(zones) || zones.length !== 1) throw new Error('The deploy token must resolve exactly one krabiclaw.com zone in the configured account')
const routes = await api(`/zones/${zones[0].id}/workers/routes`)
const workerName = environment === 'production' ? 'krabiclaw' : `krabiclaw-${environment}`
const actualRoutes = routes.filter(route => route.script === workerName).map(route => route.pattern).sort()
const expected = [...expectedRoutes].sort()
if (JSON.stringify(actualRoutes) !== JSON.stringify(expected)) {
  throw new Error(`Route reconciliation failed for ${workerName}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actualRoutes)}`)
}
