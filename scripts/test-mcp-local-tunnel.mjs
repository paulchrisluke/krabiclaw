#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { Resolver } from 'node:dns/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const root = process.cwd()
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const artifactDir = resolve(root, '.wrangler', 'mcp-harness', runId)
const tempEnvPath = resolve(root, '.wrangler', `mcp-test-${process.pid}.env`)
const children = new Set()
let cleaningUp = false
const runChatGPTGate = process.argv.includes('--chatgpt')

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

function shellSafeEnv(values) {
  return [...values.entries()].map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n'
}

function spawnLogged(command, args, { env = process.env, logName, inherit = false } = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  // spawn() failures (e.g. `cloudflared` not on PATH) emit an unhandled
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
  const code = await new Promise(resolveExit => child.once('exit', code => resolveExit(code ?? 1)))
  if (code !== 0) throw new Error(`${command} ${args.join(' ')} exited ${code}`)
}

async function waitForTunnel(child) {
  let output = ''
  const consume = (chunk) => {
    output += chunk.toString()
    const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
    if (match) return match[0]
    if (output.length > 40_000) output = output.slice(-20_000)
    return null
  }
  return await new Promise((resolveTunnel, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for cloudflared to print a quick-tunnel URL.')), 45_000)
    const onData = (chunk) => {
      const origin = consume(chunk)
      if (!origin) return
      clearTimeout(timeout)
      resolveTunnel(origin)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`cloudflared exited before creating a tunnel (${code ?? 'signal'}).`))
    })
  })
}

async function waitForUrl(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  let last = 'no response'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status < 500) return response
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 1_000))
  }
  throw new Error(`Timed out waiting for ${url}: ${last}`)
}

async function waitForDns(hostname, timeoutMs = 30_000) {
  // Query Cloudflare directly. Asking the system/router resolver before the
  // just-created record propagates can cache NXDOMAIN longer than the tunnel
  // lives, even after 1.1.1.1 already serves the record.
  const resolver = new Resolver()
  resolver.setServers(['1.1.1.1', '1.0.0.1'])
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await resolver.resolve4(hostname)
      return
    } catch {
      await new Promise(resolveWait => setTimeout(resolveWait, 1_000))
    }
  }
  throw new Error(`Quick-tunnel hostname did not appear in DNS: ${hostname}`)
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

async function startQuickTunnel(localOrigin) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const tunnel = spawnLogged('cloudflared', ['tunnel', '--url', localOrigin, '--no-autoupdate'], { logName: `cloudflared-${attempt}.log` })
    try {
      const origin = await waitForTunnel(tunnel)
      await waitForDns(new URL(origin).hostname)
      return { tunnel, origin }
    } catch (error) {
      lastError = error
      console.warn(`# Quick tunnel attempt ${attempt} was unusable: ${error instanceof Error ? error.message : error}`)
      await stopChild(tunnel)
    }
  }
  throw lastError ?? new Error('Could not start a usable Cloudflare quick tunnel.')
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
  if (existsSync(tempEnvPath)) unlinkSync(tempEnvPath)
}

process.once('SIGINT', () => cleanup().finally(() => process.exit(130)))
process.once('SIGTERM', () => cleanup().finally(() => process.exit(143)))

async function main() {
  if (!existsSync(resolve(root, '.dev.vars'))) {
    throw new Error('.dev.vars is required as the private base for the temporary MCP test env.')
  }

  console.log('# Preparing local D1 and the versioned widget asset')
  await run('yarn', ['schema:local'])
  await run('yarn', ['seed:local'])
  let localCredentials = new Map()
  if (runChatGPTGate) {
    if (existsSync(resolve(root, '.env'))) localCredentials = parseEnv(readFileSync(resolve(root, '.env'), 'utf8'))
    const localEmail = process.env.LOCAL_MCP_TEST_EMAIL || localCredentials.get('LOCAL_MCP_TEST_EMAIL') || ''
    const localPassword = process.env.LOCAL_MCP_TEST_PASSWORD || localCredentials.get('LOCAL_MCP_TEST_PASSWORD') || ''
    await run('node', ['scripts/provision-local-mcp-test-user.mjs'], {
      ...process.env,
      LOCAL_MCP_TEST_EMAIL: localEmail,
      LOCAL_MCP_TEST_PASSWORD: localPassword,
      MCP_CHATGPT_USER_ID: process.env.MCP_CHATGPT_USER_ID || 'user-mcp-managed',
    })
    localCredentials.set('LOCAL_MCP_TEST_EMAIL', localEmail)
    localCredentials.set('LOCAL_MCP_TEST_PASSWORD', localPassword)
  }
  await run('yarn', ['build:widgets'])

  console.log('# Starting a Cloudflare quick tunnel')
  const port = await availablePort()
  const localOrigin = `http://127.0.0.1:${port}`
  const { origin } = await startQuickTunnel(localOrigin)
  writeFileSync(resolve(artifactDir, 'origin.txt'), `${origin}\n`, { mode: 0o600 })
  console.log(`# Tunnel origin: ${origin}`)

  const values = parseEnv(readFileSync(resolve(root, '.dev.vars'), 'utf8'))
  const devRouteSecret = values.get('E2E_DEV_ROUTE_SECRET') || randomBytes(24).toString('hex')
  values.set('BETTER_AUTH_URL', origin)
  values.set('NUXT_PUBLIC_PLATFORM_DOMAIN', origin)
  values.set('MCP_BASE_URL', origin)
  values.set('MEDIA_BASE_URL', `${origin}/__media`)
  values.set('E2E_ALLOW_DEV_ROUTES', 'true')
  values.set('E2E_DEV_ROUTE_SECRET', devRouteSecret)
  writeFileSync(tempEnvPath, shellSafeEnv(values), { mode: 0o600 })

  const gateEnv = {
    ...process.env,
    BETTER_AUTH_URL: origin,
    NUXT_PUBLIC_PLATFORM_DOMAIN: origin,
    MCP_BASE_URL: origin,
    MEDIA_BASE_URL: `${origin}/__media`,
    E2E_ALLOW_DEV_ROUTES: 'true',
    E2E_DEV_ROUTE_SECRET: devRouteSecret,
    MCP_DEV_LOGIN: '1',
    MCP_ALLOW_CREATE: '1',
    NUXT_CF_ENV_FILE: tempEnvPath,
    PLAYWRIGHT_PREVIEW_URL: origin,
    PLAYWRIGHT_WORKERS: '1',
    PORT: String(port),
    MCP_CHATGPT_SITE_ID: process.env.MCP_CHATGPT_SITE_ID || 'site-mcp-managed',
    MCP_CHATGPT_USER_ID: process.env.MCP_CHATGPT_USER_ID || 'user-mcp-managed',
    LOCAL_MCP_TEST_EMAIL: localCredentials.get('LOCAL_MCP_TEST_EMAIL') || '',
    LOCAL_MCP_TEST_PASSWORD: localCredentials.get('LOCAL_MCP_TEST_PASSWORD') || '',
  }

  console.log('# Starting Nuxt with the generated Cloudflare env file')
  const nuxt = spawnLogged('yarn', ['dev', '--port', String(port), '--host', '127.0.0.1'], { env: gateEnv, logName: 'nuxt.log' })
  nuxt.once('exit', code => {
    if (!cleaningUp) console.error(`Nuxt exited unexpectedly (${code ?? 'signal'}). See ${resolve(artifactDir, 'nuxt.log')}`)
  })
  const discovery = await waitForUrl(`${origin}/.well-known/oauth-authorization-server`)
  if (discovery.status !== 200) {
    throw new Error(`Nuxt did not expose OAuth discovery through the allocated harness port; got HTTP ${discovery.status}.`)
  }

  console.log('# Running HTTPS API/write gates through the tunnel')
  await run('node', ['scripts/check-local-mcp-harness.mjs', '--base-url', origin, '--write-smoke'], gateEnv)
  console.log('# Running Playwright MCP gates through the tunnel')
  await run('yarn', ['test:e2e:mcp', '--workers=1'], gateEnv)

  const nuxtLog = readFileSync(resolve(artifactDir, 'nuxt.log'), 'utf8')
  if (nuxtLog.includes('[Better Auth]: Error parsing JSON')) {
    throw new Error('OAuth/CIMD registration emitted a Better Auth JSON parse error. See nuxt.log in the evidence directory.')
  }

  if (runChatGPTGate) {
    console.log('# Running the actual ChatGPT normal-browser connector gate')
    console.log(`# Configure or refresh ${process.env.CHATGPT_CONNECTOR_NAME || 'devkrabiclaw'} with: ${origin}/api/mcp`)
    await run('node', ['scripts/demo-recording/chatgpt-connector-test.mjs'], gateEnv)
  }

  console.log(`# MCP ${runChatGPTGate ? 'local and actual ChatGPT gates' : 'local gate'} passed through ${origin}`)
  console.log(`# Evidence directory: ${artifactDir}`)
}

main()
  .then(() => cleanup())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error)
    console.error(`Harness logs: ${artifactDir}`)
    await cleanup()
    process.exit(1)
  })
