#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const root = process.cwd()
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const artifactDir = resolve(root, '.wrangler', 'mcp-harness', runId)
const origin = 'https://local.krabiclaw.com'
const freeSiteDomain = 'https://krabiclaw.com'
const tunnelName = 'krabiclaw-local'
const children = new Set()
let cleaningUp = false
let succeeded = false
const runChatGPTGate = process.argv.includes('--chatgpt')
const reuseBuild = process.argv.includes('--reuse-build')

mkdirSync(artifactDir, { recursive: true })

function parseEnv(source) {
  const values = new Map()
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const index = line.indexOf('=')
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    values.set(key, value)
  }
  return values
}

function spawnLogged(command, args, { env = process.env, logName, inherit = false } = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  // spawn() failures (e.g. a missing tunnel binary) emit an unhandled
  // 'error' event with no listener otherwise, crashing the harness with a raw
  // Node stack trace instead of one of this script's clear, actionable errors.
  child.once('error', (error) => {
    console.error(`# Failed to spawn ${command}: ${error.message}`)
  })
  if (!inherit) {
    const log = createWriteStream(resolve(artifactDir, logName), { flags: 'a' })
    child.stdout.pipe(log)
    child.stderr.pipe(log)
    child.once('exit', () => log.end())
  }
  return child
}

async function run(command, args, env = process.env) {
  console.log(`> ${command} ${args.join(' ')}`)
  const child = spawnLogged(command, args, { env, inherit: true })
  // spawn() failures (missing binary) only ever emit 'error', not 'exit' — awaiting
  // 'exit' alone would hang forever in that case. spawnLogged() already logs the
  // error; race it here too so this promise actually settles either way.
  const code = await new Promise((resolveExit, reject) => {
    child.once('exit', code => resolveExit(code ?? 1))
    child.once('error', reject)
  })
  if (code !== 0) throw new Error(`${command} ${args.join(' ')} exited ${code}`)
}

async function waitForUrl(url, expectedStatus, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  let last = 'no response'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status === expectedStatus) return response
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 1_000))
  }
  throw new Error(`Timed out waiting for ${url}: ${last}`)
}

async function availablePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  if (!port) throw new Error('Could not allocate a local port for the MCP harness.')
  return port
}

function startTunnel(localOrigin) {
  return spawnLogged(
    'cloudflared',
    ['tunnel', '--no-autoupdate', '--loglevel', 'warn', 'run', '--url', localOrigin, tunnelName],
    { logName: 'cloudflared.log' },
  )
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolveExit => child.once('exit', resolveExit)),
    new Promise(resolveWait => setTimeout(resolveWait, 5_000)),
  ])
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}

async function cleanup() {
  if (cleaningUp) return
  cleaningUp = true
  await Promise.all([...children].map(stopChild))
  if (succeeded) rmSync(artifactDir, { recursive: true, force: true })
}

process.once('SIGINT', () => cleanup().finally(() => process.exit(130)))
process.once('SIGTERM', () => cleanup().finally(() => process.exit(143)))

async function main() {
  if (!existsSync(resolve(root, '.env'))) {
    throw new Error('.env is required for local MCP testing.')
  }

  const values = parseEnv(readFileSync(resolve(root, '.env'), 'utf8'))

  console.log('# Preparing local D1 and the versioned widget asset')
  await run('yarn', ['schema:local'], { ...process.env, CI: 'true' })
  await run('yarn', ['seed:local'])
  await run('node', ['--experimental-strip-types', 'scripts/provision-e2e-auth.ts'])
  const localCredentials = values
  if (runChatGPTGate) {
    const localEmail = process.env.LOCAL_MCP_TEST_EMAIL || localCredentials.get('LOCAL_MCP_TEST_EMAIL') || ''
    const localPassword = process.env.LOCAL_MCP_TEST_PASSWORD || localCredentials.get('LOCAL_MCP_TEST_PASSWORD') || ''
    await run('node', ['scripts/provision-local-mcp-test-user.mjs'], {
      ...process.env,
      LOCAL_MCP_TEST_EMAIL: localEmail,
      LOCAL_MCP_TEST_PASSWORD: localPassword,
      MCP_CHATGPT_USER_ID: process.env.MCP_CHATGPT_USER_ID || 'user-mcp-growth-service',
    })
    localCredentials.set('LOCAL_MCP_TEST_EMAIL', localEmail)
    localCredentials.set('LOCAL_MCP_TEST_PASSWORD', localPassword)
  }

  const port = await availablePort()
  const localOrigin = `http://127.0.0.1:${port}`

  const devRouteSecret = values.get('E2E_DEV_ROUTE_SECRET')
  if (!devRouteSecret) throw new Error('E2E_DEV_ROUTE_SECRET is required in .env.')
  values.set('BETTER_AUTH_URL', origin)
  values.set('NUXT_PUBLIC_PLATFORM_DOMAIN', origin)
  values.set('NUXT_PUBLIC_FREE_SITE_DOMAIN', freeSiteDomain)
  values.set('NUXT_PUBLIC_APP_NAME', values.get('NUXT_PUBLIC_APP_NAME') || 'KrabiClaw')
  values.set('MCP_BASE_URL', origin)
  values.set('MEDIA_BASE_URL', `${origin}/__media`)
  values.set('E2E_ALLOW_DEV_ROUTES', 'true')
  values.set('E2E_DEV_ROUTE_SECRET', devRouteSecret)

  const gateEnv = {
    ...process.env,
    ...Object.fromEntries(values),
    BETTER_AUTH_URL: origin,
    NUXT_PUBLIC_PLATFORM_DOMAIN: origin,
    NUXT_PUBLIC_FREE_SITE_DOMAIN: freeSiteDomain,
    NUXT_PUBLIC_APP_NAME: values.get('NUXT_PUBLIC_APP_NAME') || 'KrabiClaw',
    MCP_BASE_URL: origin,
    MEDIA_BASE_URL: `${origin}/__media`,
    E2E_ALLOW_DEV_ROUTES: 'true',
    E2E_DEV_ROUTE_SECRET: devRouteSecret,
    MCP_CREDENTIAL_LOGIN: '1',
    MCP_ALLOW_CREATE: '1',
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      '--dns-result-order=ipv4first',
      '--no-network-family-autoselection',
    ].filter(Boolean).join(' '),
    PLAYWRIGHT_PREVIEW_URL: origin,
    PLAYWRIGHT_WORKERS: '1',
    PORT: String(port),
    MCP_CHATGPT_SITE_ID: process.env.MCP_CHATGPT_SITE_ID || 'site-mcp-growth-service',
    MCP_CHATGPT_USER_ID: process.env.MCP_CHATGPT_USER_ID || 'user-mcp-growth-service',
    LOCAL_MCP_TEST_EMAIL: localCredentials.get('LOCAL_MCP_TEST_EMAIL') || '',
    LOCAL_MCP_TEST_PASSWORD: localCredentials.get('LOCAL_MCP_TEST_PASSWORD') || '',
  }

  console.log('# Building and starting the local Cloudflare Worker')
  if (reuseBuild) {
    const workerEntry = resolve(root, '.output', 'server', 'index.mjs')
    if (!existsSync(workerEntry)) throw new Error('--reuse-build requires an existing .output/server/index.mjs artifact.')
    console.log('# Reusing the existing production build artifact')
  } else {
    await run('yarn', ['build'], gateEnv)
  }
  const workerVars = [
    ['BETTER_AUTH_URL', origin],
    ['NUXT_PUBLIC_PLATFORM_DOMAIN', origin],
    ['NUXT_PUBLIC_FREE_SITE_DOMAIN', freeSiteDomain],
    ['NUXT_PUBLIC_APP_NAME', gateEnv.NUXT_PUBLIC_APP_NAME],
    ['MEDIA_BASE_URL', `${origin}/__media`],
    ['E2E_ALLOW_DEV_ROUTES', 'true'],
  ]
  const workerArgs = [
    'wrangler',
    'dev',
    '--config',
    'wrangler.toml',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--host',
    new URL(origin).hostname,
    '--log-level',
    'warn',
  ]
  for (const [name, value] of workerVars) workerArgs.push('--var', `${name}:${value}`)
  const worker = spawnLogged('yarn', workerArgs, { env: gateEnv, logName: 'worker.log' })
  worker.once('exit', code => {
    if (!cleaningUp) console.error(`Worker exited unexpectedly (${code ?? 'signal'}). See ${resolve(artifactDir, 'worker.log')}`)
  })
  console.log(`# Starting ${tunnelName} at ${origin}`)
  const tunnel = startTunnel(localOrigin)
  tunnel.once('exit', code => {
    if (!cleaningUp) console.error(`Tunnel exited unexpectedly (${code ?? 'signal'}). See ${resolve(artifactDir, 'cloudflared.log')}`)
  })
  await waitForUrl(`${origin}/.well-known/oauth-authorization-server`, 200)

  console.log('# Running HTTPS API/write gates through the tunnel')
  await run('node', ['scripts/test-mcp-oauth.mjs', '--base-url', origin], gateEnv)
  await run('node', ['scripts/check-local-mcp-harness.mjs', '--base-url', origin, '--write-smoke'], gateEnv)
  console.log('# Running Playwright MCP gates through the tunnel')
  await run('yarn', ['test:e2e:mcp', '--workers=1'], gateEnv)
  console.log('# Running priority tenant browser gates through the tunnel')
  await run('yarn', ['test:e2e:public-rendering', '--workers=1'], gateEnv)

  if (runChatGPTGate) {
    console.log('# Running the automated ChatGPT Chrome and telemetry gate')
    console.log(`# The ${process.env.CHATGPT_CONNECTOR_NAME || 'devkrabiclaw'} connection must use: ${origin}/api/mcp`)
    await run('node', ['scripts/demo-recording/chatgpt-connector-test.mjs'], gateEnv)
  }

  console.log(`# MCP ${runChatGPTGate ? 'local and actual ChatGPT gates' : 'local gate'} passed through ${origin}`)
  succeeded = true
}

main()
  .then(() => cleanup())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error)
    console.error(`Harness logs: ${artifactDir}`)
    await cleanup()
    process.exit(1)
  })
