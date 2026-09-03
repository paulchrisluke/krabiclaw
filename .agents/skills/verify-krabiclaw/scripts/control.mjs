#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { prepareD1SeedFile } from '../../../../scripts/utils/d1-seed-file.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, '../../../..')
const WORK_ROOT = join(ROOT, '.tmp', 'verify-krabiclaw')
const RUNTIME_ROOT = join(WORK_ROOT, 'runtime')
const EVIDENCE_ROOT = join(WORK_ROOT, 'evidence')
const ACTIVE_PATH = join(WORK_ROOT, 'active.json')
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const PLAYWRIGHT = join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js')
const COREPACK = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js')
const WORKER_ENTRY = join(ROOT, '.output', 'server', 'index.mjs')
const DEFAULT_PORT = 4173
const MAX_BUFFER = 256 * 1024 * 1024
const FEATURE_TESTS = {
  'tenant-navigation': {
    spec: 'tests/e2e/tenant-client-navigation.spec.ts',
    grep: 'Pottery home',
  },
  'experience-booking': {
    spec: 'tests/e2e/tenant-guest-journeys.spec.ts',
    grep: 'Pottery House experience booking',
  },
  'restaurant-reservation': {
    spec: 'tests/e2e/tenant-guest-journeys.spec.ts',
    grep: 'Kikuzuki restaurant reservation',
  },
  'guest-contact': {
    spec: 'tests/e2e/tenant-guest-journeys.spec.ts',
    grep: 'Pottery House contact',
  },
}

function fail(message) {
  throw new Error(message)
}

function ensureWorkDirectories() {
  mkdirSync(RUNTIME_ROOT, { recursive: true })
  mkdirSync(EVIDENCE_ROOT, { recursive: true })
}

function assertDisposablePath(path) {
  const resolved = resolve(path)
  const suffix = relative(resolve(WORK_ROOT), resolved)
  if (!suffix || suffix.startsWith(`..${sep}`) || suffix === '..') {
    fail(`Refusing to remove a path outside the verification workspace: ${resolved}`)
  }
  return resolved
}

function parsePositivePort(raw) {
  const port = Number.parseInt(raw ?? String(DEFAULT_PORT), 10)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    fail('KRABICLAW_VERIFY_PORT must be an integer from 1024 through 65535.')
  }
  return port
}

function parseState(raw) {
  const value = JSON.parse(raw)
  if (!value || typeof value !== 'object') fail('Verification state is not an object.')
  for (const key of ['runId', 'baseURL', 'runtimeDir', 'd1Dir', 'logPath', 'authPath', 'revision', 'buildHash', 'devRouteSecret']) {
    if (typeof value[key] !== 'string' || !value[key]) fail(`Verification state is missing ${key}.`)
  }
  if (!Number.isInteger(value.pid) || value.pid <= 0) fail('Verification state has an invalid PID.')
  if (!Number.isInteger(value.port) || value.port <= 0) fail('Verification state has an invalid port.')
  return value
}

function readState() {
  if (!existsSync(ACTIVE_PATH)) fail('No active KrabiClaw verification instance. Run the launch command first.')
  return parseState(readFileSync(ACTIVE_PATH, 'utf8'))
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function run(command, args, options = {}) {
  const printable = [command, ...args].map(value => /\s/.test(value) ? JSON.stringify(value) : value).join(' ')
  if (!options.quiet) process.stdout.write(`> ${printable}\n`)
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: options.env ?? process.env,
    encoding: options.capture ? 'utf8' : undefined,
    maxBuffer: MAX_BUFFER,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : ''
    fail(`Command exited with status ${result.status}: ${printable}${detail}`)
  }
  return options.capture ? result.stdout : ''
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function gitRevision() {
  return run('git', ['rev-parse', 'HEAD'], { capture: true, quiet: true }).trim()
}

function portAcceptsConnections(port) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const done = (result) => {
      socket.destroy()
      resolvePromise(result)
    }
    socket.setTimeout(400)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

function sleep(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
}

async function waitForTenant(baseURL, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'no response'
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`Wrangler exited before readiness with status ${child.exitCode}.`)
    try {
      const response = await fetch(baseURL, { headers: { 'x-preview-tenant': 'ncls' } })
      const body = await response.text()
      if (response.status < 400 && /North Carolina Legal Services/i.test(body)) return
      lastError = `HTTP ${response.status}, tenant identity absent: ${body.slice(0, 160)}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(500)
  }
  fail(`Worker did not become ready: ${lastError}`)
}

function responseCookies(response) {
  return response.headers.getSetCookie()
    .map(value => value.split(';')[0])
    .filter(Boolean)
}

function mergeCookies(current, response) {
  const values = new Map()
  for (const entry of current.split(';')) {
    const trimmed = entry.trim()
    const separator = trimmed.indexOf('=')
    if (separator > 0) values.set(trimmed.slice(0, separator), trimmed)
  }
  for (const entry of responseCookies(response)) {
    const separator = entry.indexOf('=')
    if (separator > 0) values.set(entry.slice(0, separator), entry)
  }
  return [...values.values()].join('; ')
}

async function createCredentialSession(baseURL, password, devRouteSecret) {
  const email = 'demo-owner@playwright.example'
  const userId = 'user-e2e-demo-owner'
  const origin = new URL(baseURL).origin
  const signIn = await fetch(new URL('/api/auth/sign-in/email', baseURL), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'x-dev-route-secret': devRouteSecret },
    body: JSON.stringify({ email, password, rememberMe: false }),
  })
  if (!signIn.ok) fail(`Better Auth sign-in failed with ${signIn.status}: ${await signIn.text()}`)
  let cookie = mergeCookies('', signIn)
  if (!cookie) fail('Better Auth sign-in did not return a session cookie.')
  const activeOrganization = await fetch(new URL('/api/auth/organization/set-active', baseURL), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin, 'x-dev-route-secret': devRouteSecret },
    body: JSON.stringify({ organizationId: 'org-demo' }),
  })
  if (!activeOrganization.ok) {
    fail(`Better Auth active-organization selection failed with ${activeOrganization.status}: ${await activeOrganization.text()}`)
  }
  cookie = mergeCookies(cookie, activeOrganization)
  return { cookie, email, password, userId }
}

async function prepareIsolatedD1(runtimeDir, password) {
  const d1Dir = join(runtimeDir, 'd1')
  const seedsDir = join(runtimeDir, 'seeds')
  mkdirSync(d1Dir, { recursive: true })
  mkdirSync(seedsDir, { recursive: true })
  run(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', d1Dir], {
    capture: true,
    env: { ...process.env, CI: 'true' },
  })

  const generators = [
    ['demo', 'scripts/generate-demo-seed.ts'],
    ['pottery-house', 'scripts/generate-pottery-house-seed.ts'],
    ['kikuzuki', 'scripts/generate-kikuzuki-seed.ts'],
    ['ncls', 'scripts/generate-ncls-seed.ts'],
  ]
  for (const [name, generator] of generators) {
    const sql = run(process.execPath, ['--experimental-strip-types', join(ROOT, generator), '--stdout'], { capture: true })
    const rawPath = join(seedsDir, `${name}.sql`)
    writeFileSync(rawPath, sql, 'utf8')
    const prepared = await prepareD1SeedFile(rawPath)
    try {
      run(process.execPath, [WRANGLER, 'd1', 'execute', 'DB', '--local', '--persist-to', d1Dir, '--file', prepared.path], { capture: true })
    } finally {
      await prepared.cleanup()
    }
  }

  run(process.execPath, [
    '--experimental-strip-types',
    join(ROOT, 'scripts', 'provision-e2e-auth.ts'),
    '--persist-to', d1Dir,
  ], { capture: true, env: { ...process.env, E2E_TEST_PASSWORD: password } })
  return d1Dir
}

function workerArguments({ port, d1Dir, devRouteSecret }) {
  const baseURL = `http://localhost:${port}`
  const variables = {
    E2E_ALLOW_DEV_ROUTES: 'true',
    E2E_DEV_ROUTE_SECRET: devRouteSecret,
    EMAIL_DELIVERY_MODE: 'log_only',
    WHATSAPP_DELIVERY_MODE: 'log_only',
    DISCORD_DELIVERY_MODE: 'log_only',
    BETTER_AUTH_URL: baseURL,
    NUXT_PUBLIC_PLATFORM_DOMAIN: baseURL,
    NUXT_PUBLIC_FREE_SITE_DOMAIN: baseURL,
    NUXT_PUBLIC_APP_NAME: 'KrabiClaw',
    NUXT_PUBLIC_SITE_URL: baseURL,
    NUXT_PUBLIC_HELP_URL: `${baseURL}/help`,
  }
  return [
    WRANGLER,
    'dev', WORKER_ENTRY,
    '--assets', join(ROOT, '.output', 'public'),
    '--local',
    '--ip', '127.0.0.1',
    '--port', String(port),
    '--persist-to', d1Dir,
    '--log-level', 'info',
    ...Object.entries(variables).flatMap(([name, value]) => ['--var', `${name}:${value}`]),
  ]
}

function writeJson(path, value, mode = 0o600) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode })
}

async function launch() {
  ensureWorkDirectories()
  if (existsSync(ACTIVE_PATH)) {
    const existing = readState()
    if (processIsAlive(existing.pid)) {
      fail(`Verification run ${existing.runId} is already active at ${existing.baseURL}.`)
    }
    cleanupState(existing)
  }

  const port = parsePositivePort(process.env.KRABICLAW_VERIFY_PORT)
  if (await portAcceptsConnections(port)) fail(`Port ${port} is already in use. Set KRABICLAW_VERIFY_PORT to a free port.`)
  const runId = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')
  const runtimeDir = join(RUNTIME_ROOT, runId)
  const logPath = join(runtimeDir, 'worker.log')
  const authPath = join(runtimeDir, 'auth.json')
  const baseURL = `http://localhost:${port}`
  const password = randomBytes(24).toString('base64url')
  const devRouteSecret = randomBytes(24).toString('base64url')
  mkdirSync(runtimeDir, { recursive: true })

  try {
    if (existsSync(COREPACK)) run(process.execPath, [COREPACK, 'yarn', 'build'], { capture: true })
    else run('corepack', ['yarn', 'build'], { capture: true })
    if (!existsSync(WORKER_ENTRY)) fail('The Worker build did not create .output/server/index.mjs.')
    const d1Dir = await prepareIsolatedD1(runtimeDir, password)
    const logFd = openSync(logPath, 'a')
    const child = spawn(process.execPath, workerArguments({ port, d1Dir, devRouteSecret }), {
      cwd: ROOT,
      detached: true,
      env: {
        ...process.env,
        EMAIL_DELIVERY_MODE: 'log_only',
        WHATSAPP_DELIVERY_MODE: 'log_only',
        DISCORD_DELIVERY_MODE: 'log_only',
        BETTER_AUTH_URL: baseURL,
        NUXT_PUBLIC_PLATFORM_DOMAIN: baseURL,
        NUXT_PUBLIC_FREE_SITE_DOMAIN: baseURL,
        NUXT_PUBLIC_APP_NAME: 'KrabiClaw',
        NUXT_PUBLIC_SITE_URL: baseURL,
        NUXT_PUBLIC_HELP_URL: `${baseURL}/help`,
      },
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    })
    closeSync(logFd)
    if (!child.pid) fail('Wrangler did not return a process ID.')
    const state = {
      runId,
      pid: child.pid,
      port,
      baseURL,
      runtimeDir,
      d1Dir,
      logPath,
      authPath,
      revision: gitRevision(),
      buildHash: hashFile(WORKER_ENTRY),
      devRouteSecret,
      startedAt: new Date().toISOString(),
    }
    writeJson(ACTIVE_PATH, state)
    await waitForTenant(baseURL, child)
    const auth = await createCredentialSession(baseURL, password, devRouteSecret)
    writeJson(authPath, auth)
    child.unref()
    await doctor()
    process.stdout.write(`KrabiClaw verification run ${runId} is ready at ${baseURL}.\n`)
  } catch (error) {
    if (existsSync(ACTIVE_PATH)) {
      try { cleanupState(readState()) } catch {}
    } else if (existsSync(runtimeDir)) {
      rmSync(assertDisposablePath(runtimeDir), { recursive: true, force: true })
    }
    throw error
  }
}

function windowsPortOwners(port) {
  const script = [
    "$ErrorActionPreference='Stop'",
    `$owners = @(Get-NetTCPConnection -State Listen -LocalPort ${port} | Select-Object -ExpandProperty OwningProcess -Unique)`,
    "$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)",
    "@{ owners = $owners; processes = $processes } | ConvertTo-Json -Compress -Depth 3",
  ].join('; ')
  const output = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { capture: true, quiet: true })
  const parsed = JSON.parse(output)
  const owners = Array.isArray(parsed.owners) ? parsed.owners : [parsed.owners]
  const processes = Array.isArray(parsed.processes) ? parsed.processes : [parsed.processes]
  return {
    owners: owners.filter(Number.isInteger),
    parents: new Map(processes.map(row => [row.ProcessId, row.ParentProcessId])),
  }
}

function processBelongsToTree(pid, rootPid, parents) {
  let current = pid
  const visited = new Set()
  while (Number.isInteger(current) && current > 0 && !visited.has(current)) {
    if (current === rootPid) return true
    visited.add(current)
    current = parents.get(current)
  }
  return false
}

function verifyPortOwnership(state) {
  if (process.platform !== 'win32') return 'HTTP listener reached; exact owner check is implemented for Windows hosts.'
  const { owners, parents } = windowsPortOwners(state.port)
  if (!owners.length) fail(`No process owns listening port ${state.port}.`)
  if (!owners.some(pid => processBelongsToTree(pid, state.pid, parents))) {
    fail(`Port ${state.port} is owned by PID ${owners.join(', ')}, outside launched process tree ${state.pid}.`)
  }
  return `port ${state.port} belongs to launched process tree ${state.pid}`
}

async function doctor() {
  const state = readState()
  if (!processIsAlive(state.pid)) fail(`Wrangler PID ${state.pid} is not running.`)
  if (!existsSync(WORKER_ENTRY)) fail('The launched Worker build no longer exists.')
  if (hashFile(WORKER_ENTRY) !== state.buildHash) fail('The Worker build changed after launch. Clean up and launch again.')
  if (gitRevision() !== state.revision) fail('The checkout revision changed after launch. Clean up and launch again.')
  const ownership = verifyPortOwnership(state)

  const tenant = await fetch(state.baseURL, { headers: { 'x-preview-tenant': 'ncls' } })
  const tenantBody = await tenant.text()
  if (!tenant.ok || !/North Carolina Legal Services/i.test(tenantBody)) {
    fail(`Tenant health check failed with HTTP ${tenant.status}.`)
  }

  const auth = JSON.parse(readFileSync(state.authPath, 'utf8'))
  if (!auth || typeof auth.cookie !== 'string' || typeof auth.userId !== 'string') fail('Stored verification auth state is invalid.')
  const session = await fetch(new URL('/api/auth/get-session', state.baseURL), { headers: { cookie: auth.cookie } })
  const sessionBody = await session.json()
  if (!session.ok || sessionBody?.user?.id !== auth.userId) fail(`Better Auth session check failed with HTTP ${session.status}.`)

  process.stdout.write([
    `doctor: ready ${state.baseURL}`,
    `doctor: ${ownership}`,
    `doctor: build ${state.buildHash.slice(0, 12)} at revision ${state.revision.slice(0, 12)}`,
    `doctor: tenant routing returned North Carolina Legal Services`,
    `doctor: Better Auth session belongs to ${auth.userId}`,
  ].join('\n') + '\n')
}

function evidenceDirectory(state, feature) {
  const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')
  const path = join(EVIDENCE_ROOT, state.runId, `${feature}-${timestamp}`)
  mkdirSync(path, { recursive: true })
  return path
}

function findFiles(directory, name) {
  const matches = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) matches.push(...findFiles(path, name))
    else if (entry.name === name) matches.push(path)
  }
  return matches
}

async function driveExistingTest(state, feature) {
  const recipe = FEATURE_TESTS[feature]
  const outputDir = evidenceDirectory(state, feature)
  const auth = JSON.parse(readFileSync(state.authPath, 'utf8'))
  const args = [
    PLAYWRIGHT,
    'test', recipe.spec,
    '--project=chromium',
    '--workers=1',
    '--trace=on',
    '--output', outputDir,
    '--grep', recipe.grep,
  ]
  const startedAt = new Date().toISOString()
  try {
    run(process.execPath, args, {
      env: {
        ...process.env,
        PLAYWRIGHT_PREVIEW_URL: state.baseURL,
        E2E_DEV_ROUTE_SECRET: state.devRouteSecret,
        E2E_TEST_PASSWORD: auth.password,
      },
    })
    const traces = findFiles(outputDir, 'trace.zip')
    if (!traces.length) fail('Playwright passed but did not retain a trace.')
    writeJson(join(outputDir, 'evidence.json'), {
      feature,
      startedAt,
      finishedAt: new Date().toISOString(),
      baseURL: state.baseURL,
      revision: state.revision,
      spec: recipe.spec,
      grep: recipe.grep,
      traces: traces.map(path => relative(ROOT, path)),
      result: 'passed',
    }, 0o644)
    process.stdout.write(`Evidence retained at ${outputDir}\n`)
  } catch (error) {
    writeJson(join(outputDir, 'evidence.json'), {
      feature,
      startedAt,
      finishedAt: new Date().toISOString(),
      baseURL: state.baseURL,
      revision: state.revision,
      spec: recipe.spec,
      grep: recipe.grep,
      result: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }, 0o644)
    throw error
  }
}

async function driveDashboardLogin(state) {
  const feature = 'dashboard-login'
  const outputDir = evidenceDirectory(state, feature)
  const auth = JSON.parse(readFileSync(state.authPath, 'utf8'))
  const startedAt = new Date().toISOString()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ baseURL: state.baseURL })
  const page = await context.newPage()
  await page.route('**/api/auth/**', async route => {
    await route.continue({
      headers: { ...route.request().headers(), 'x-dev-route-secret': state.devRouteSecret },
    })
  })
  const browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('ERR_FAILED')) browserErrors.push(message.text())
  })
  try {
    const login = await page.goto('/login', { waitUntil: 'load' })
    if (!login?.ok()) fail(`Login page returned HTTP ${login?.status() ?? 'no response'}.`)
    await page.getByRole('heading', { name: 'Sign in' }).waitFor()
    await page.waitForFunction(() => Boolean(document.querySelector('#__nuxt')?.__vue_app__))
    await page.screenshot({ path: join(outputDir, '01-login.png'), fullPage: true })
    writeFileSync(join(outputDir, '01-login.aria.txt'), await page.locator('body').ariaSnapshot(), 'utf8')

    const emailInput = page.getByLabel('Email')
    const passwordInput = page.getByLabel('Password')
    await emailInput.fill(auth.email)
    await passwordInput.fill(auth.password)
    if (await emailInput.inputValue() !== auth.email) fail('The hydrated email input did not retain the fixture address.')
    if (await passwordInput.inputValue() !== auth.password) fail('The hydrated password input did not retain the fixture password.')
    await page.screenshot({ path: join(outputDir, '02-credentials-entered.png'), fullPage: true })
    await page.getByRole('button', { name: 'Sign in with email' }).click()
    await page.waitForURL(/\/dashboard\/ember-slice-demo\/?$/, { timeout: 15_000 })
    await page.getByText('Today', { exact: true }).first().waitFor()
    await page.screenshot({ path: join(outputDir, '03-dashboard.png'), fullPage: true })
    writeFileSync(join(outputDir, '03-dashboard.aria.txt'), await page.locator('body').ariaSnapshot(), 'utf8')

    const session = await context.request.get('/api/auth/get-session')
    const sessionBody = await session.json()
    if (!session.ok() || sessionBody?.user?.id !== auth.userId) fail('Dashboard browser session does not belong to the fixture user.')
    if (browserErrors.length) fail(`Browser errors: ${browserErrors.join(' | ')}`)
    writeJson(join(outputDir, 'evidence.json'), {
      feature,
      startedAt,
      finishedAt: new Date().toISOString(),
      baseURL: state.baseURL,
      revision: state.revision,
      action: 'Signed in through the email form as the seeded demo owner.',
      result: `Reached ${page.url()} with Better Auth user ${auth.userId}.`,
      artifacts: ['01-login.png', '01-login.aria.txt', '02-credentials-entered.png', '03-dashboard.png', '03-dashboard.aria.txt'],
    }, 0o644)
    process.stdout.write(`Evidence retained at ${outputDir}\n`)
  } catch (error) {
    await page.screenshot({ path: join(outputDir, 'failure.png'), fullPage: true }).catch(() => {})
    writeJson(join(outputDir, 'evidence.json'), {
      feature,
      startedAt,
      finishedAt: new Date().toISOString(),
      baseURL: state.baseURL,
      revision: state.revision,
      result: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }, 0o644)
    throw error
  } finally {
    await browser.close()
  }
}

async function drive(feature) {
  await doctor()
  const state = readState()
  if (feature === 'dashboard-login') return driveDashboardLogin(state)
  if (!Object.hasOwn(FEATURE_TESTS, feature)) {
    fail(`Unknown feature ${JSON.stringify(feature)}. Choose ${[...Object.keys(FEATURE_TESTS), 'dashboard-login'].join(', ')}.`)
  }
  return driveExistingTest(state, feature)
}

function terminateProcessTree(pid) {
  if (!processIsAlive(pid)) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    return
  }
  try { process.kill(-pid, 'SIGTERM') } catch {}
}

function cleanupState(state) {
  terminateProcessTree(state.pid)
  const runtimeDir = assertDisposablePath(state.runtimeDir)
  if (existsSync(runtimeDir)) {
    rmSync(runtimeDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
  if (existsSync(ACTIVE_PATH)) rmSync(ACTIVE_PATH, { force: true })
}

function cleanup() {
  if (!existsSync(ACTIVE_PATH)) {
    process.stdout.write('No active KrabiClaw verification instance. Evidence is untouched.\n')
    return
  }
  const state = readState()
  cleanupState(state)
  process.stdout.write(`Stopped verification run ${state.runId}. Evidence remains under ${join(EVIDENCE_ROOT, state.runId)}.\n`)
}

function usage() {
  process.stdout.write(`Usage:
  node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs launch
  node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs doctor
  node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive <feature>
  node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs cleanup

Features: ${[...Object.keys(FEATURE_TESTS), 'dashboard-login'].join(', ')}
`)
}

const [command, argument] = process.argv.slice(2)
try {
  if (command === 'launch') await launch()
  else if (command === 'doctor') await doctor()
  else if (command === 'drive' && argument) await drive(argument)
  else if (command === 'cleanup') cleanup()
  else {
    usage()
    process.exitCode = command ? 1 : 0
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
}
