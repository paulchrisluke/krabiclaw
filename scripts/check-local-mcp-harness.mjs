#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const _baseUrlArg = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : undefined
if (_baseUrlArg !== undefined && !_baseUrlArg) {
  console.error('--base-url requires a non-empty URL value')
  process.exit(1)
}

const BASE_URL = (_baseUrlArg ?? process.env.MCP_BASE_URL ?? process.env.BETTER_AUTH_URL ?? 'https://local.krabiclaw.com').replace(/\/$/, '')
const WRITE_SMOKE = process.argv.includes('--write-smoke')
const CANONICAL_LOCAL_ORIGIN = 'https://local.krabiclaw.com'
const TUNNEL_CONFIG_PATH = 'tunnel.yml'
const CANONICAL_TUNNEL_ID = 'ba36c78c-9e7d-4312-be92-63a58d96baba'
const CANONICAL_TUNNEL_NAME = 'krabiclaw-local'
const MCP_VERSION = process.env.MCP_PROTOCOL_VERSION ?? '2026-07-28'

let failed = false

function pass(message) {
  console.log(`ok  ${message}`)
}

function fail(message, detail) {
  failed = true
  console.error(`not ok  ${message}`)
  if (detail) console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2))
}

function skip(message) {
  console.log(`skip  ${message}`)
}

function note(message) {
  console.log(`# ${message}`)
}

function envValue(name) {
  return process.env[name] ?? ''
}

function envRequired(name) {
  const value = envValue(name)
  if (!value) fail(`${name} is required`)
  else pass(`${name} is set`)
  return value
}

function parseOrigin(value, label) {
  try {
    return new URL(value).origin
  } catch {
    fail(`${label} must be a valid absolute URL`, value)
    return null
  }
}

function extractTunnelHostname() {
  if (!existsSync(TUNNEL_CONFIG_PATH)) return null
  const source = readFileSync(TUNNEL_CONFIG_PATH, 'utf8')
  const match = source.match(/^\s*hostname:\s*("?)([^"\n#]+)\1\s*$/m)
  return match ? `https://${match[2].trim()}` : null
}

function extractTunnelId() {
  if (!existsSync(TUNNEL_CONFIG_PATH)) return null
  const source = readFileSync(TUNNEL_CONFIG_PATH, 'utf8')
  const match = source.match(/^\s*tunnel:\s*("?)([^"\n#]+)\1\s*$/m)
  return match ? match[2].trim() : null
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { res, body }
}

async function verifyRemoteTunnelConfig(baseOrigin) {
  const accountId = envValue('CF_ACCOUNT_ID')
  const apiToken = envValue('CLOUDFLARE_API_TOKEN')
  if (!accountId || !apiToken) {
    skip('remote tunnel verification skipped; set CF_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to compare against Cloudflare')
    return
  }

  const remote = await fetchJson(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${CANONICAL_TUNNEL_ID}/configurations`, {
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
    },
  })

  if (remote.res.status !== 200 || remote.body?.success !== true) {
    fail('could not read remote Cloudflare tunnel configuration', { status: remote.res.status, body: remote.body })
    return
  }

  const remoteTunnelId = remote.body?.result?.tunnel_id ?? ''
  const remoteHostname = remote.body?.result?.config?.ingress?.find((entry) => entry.hostname)?.hostname ?? ''
  const remoteService = remote.body?.result?.config?.ingress?.find((entry) => entry.hostname)?.service ?? ''

  if (remoteTunnelId === CANONICAL_TUNNEL_ID) pass('remote Cloudflare tunnel id matches canonical local tunnel')
  else fail('remote Cloudflare tunnel id mismatch', { expected: CANONICAL_TUNNEL_ID, actual: remoteTunnelId })

  if (remoteHostname && `https://${remoteHostname}` === baseOrigin) pass('remote Cloudflare tunnel hostname matches MCP origin')
  else fail('remote Cloudflare tunnel hostname mismatch', { remoteHostname, baseOrigin })

  if (remoteService === 'http://localhost:3000' || remoteService === 'http://127.0.0.1:3000') {
    pass('remote Cloudflare tunnel forwards to the expected local dev server')
  } else {
    fail('remote Cloudflare tunnel service target mismatch', { remoteService })
  }

  const tunnel = await fetchJson(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${CANONICAL_TUNNEL_ID}`, {
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
    },
  })

  if (tunnel.res.status !== 200 || tunnel.body?.success !== true) {
    fail('could not read remote Cloudflare tunnel metadata', { status: tunnel.res.status, body: tunnel.body })
    return
  }

  const remoteName = tunnel.body?.result?.name ?? ''
  if (remoteName === CANONICAL_TUNNEL_NAME) pass('remote Cloudflare tunnel name matches expected local tunnel')
  else fail('remote Cloudflare tunnel name mismatch', { expected: CANONICAL_TUNNEL_NAME, actual: remoteName })
}

async function verifyOAuthMetadata(baseOrigin) {
  const protectedResource = await fetchJson(`${baseOrigin}/.well-known/oauth-protected-resource`)
  if (protectedResource.res.status === 200) pass('oauth-protected-resource endpoint responds')
  else fail('oauth-protected-resource endpoint failed', { status: protectedResource.res.status, body: protectedResource.body })
  if (protectedResource.body?.resource === `${baseOrigin}/api/mcp`) pass('oauth-protected-resource points at /api/mcp')
  else fail('oauth-protected-resource resource mismatch', protectedResource.body)

  const authzServer = await fetchJson(`${baseOrigin}/.well-known/oauth-authorization-server`)
  if (authzServer.res.status === 200) pass('oauth-authorization-server endpoint responds')
  else fail('oauth-authorization-server endpoint failed', { status: authzServer.res.status, body: authzServer.body })
  if (authzServer.body?.issuer === baseOrigin) pass('oauth-authorization-server issuer matches base URL')
  else fail('oauth-authorization-server issuer mismatch', authzServer.body)

  const unauthDiscover = await fetchJson(`${baseOrigin}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': 'server/discover',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'local-harness-discover',
      method: 'server/discover',
      params: {},
      _meta: {
        'io.modelcontextprotocol/version': MCP_VERSION,
        'io.modelcontextprotocol/method': 'server/discover',
      },
    }),
  })
  if (unauthDiscover.res.status === 401) pass('unauthenticated server/discover returns 401')
  else fail('unauthenticated server/discover did not return 401', { status: unauthDiscover.res.status, body: unauthDiscover.body })

  const unauthTool = await fetchJson(`${baseOrigin}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': 'tools/call',
      'mcp-name': 'list_sites',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'local-harness-tool-auth',
      method: 'tools/call',
      params: { name: 'list_sites', arguments: {} },
      _meta: {
        'io.modelcontextprotocol/version': MCP_VERSION,
        'io.modelcontextprotocol/method': 'tools/call',
        'io.modelcontextprotocol/name': 'list_sites',
      },
    }),
  })
  const challenge = unauthTool.body?.result?._meta?.['mcp/www_authenticate']?.[0] ?? ''
  if (unauthTool.res.status === 200 && unauthTool.body?.result?.isError === true && challenge.includes('resource_metadata=')) {
    pass('unauthenticated tools/call returns auth challenge')
  } else {
    fail('unauthenticated tools/call did not return expected auth challenge', { status: unauthTool.res.status, body: unauthTool.body })
  }
}

async function verifyDevRoutes(baseOrigin, requireSecret) {
  const headers = {}
  if (requireSecret) headers['x-dev-route-secret'] = envValue('E2E_DEV_ROUTE_SECRET')

  const devLogin = await fetch(`${baseOrigin}/api/dev/login`, {
    headers,
    redirect: 'manual',
  })
  const setCookie = devLogin.headers.get('set-cookie')
  if ((devLogin.status === 302 || devLogin.status === 307) && setCookie) {
    pass('/api/dev/login responds with a session cookie')
  } else {
    fail('/api/dev/login did not return a session cookie', { status: devLogin.status, location: devLogin.headers.get('location') })
  }

  const telemetry = await fetchJson(`${baseOrigin}/api/dev/mcp-telemetry?since=${encodeURIComponent(new Date().toISOString())}&limit=1`, {
    headers,
  })
  if (telemetry.res.status === 200 && Array.isArray(telemetry.body?.events)) pass('/api/dev/mcp-telemetry is reachable')
  else fail('/api/dev/mcp-telemetry is not reachable', { status: telemetry.res.status, body: telemetry.body })
}

function runNodeScript(script, args, env) {
  note(`running ${script} ${args.join(' ')}`.trim())
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    env,
  })
  if (result.status === 0) {
    pass(`${script} passed`)
  } else {
    fail(`${script} failed`, { exitCode: result.status })
  }
}

async function main() {
  note(`checking local MCP harness at ${BASE_URL}`)

  const betterAuthUrl = envRequired('BETTER_AUTH_URL')
  const platformDomain = envRequired('NUXT_PUBLIC_PLATFORM_DOMAIN')
  const mcpBaseUrl = envRequired('MCP_BASE_URL')
  const e2eAllow = envRequired('E2E_ALLOW_DEV_ROUTES')

  if (e2eAllow === 'true') pass('E2E_ALLOW_DEV_ROUTES=true')
  else fail('E2E_ALLOW_DEV_ROUTES must be true for the local MCP harness', e2eAllow)

  const betterAuthOrigin = parseOrigin(betterAuthUrl, 'BETTER_AUTH_URL')
  const platformOrigin = parseOrigin(platformDomain, 'NUXT_PUBLIC_PLATFORM_DOMAIN')
  const mcpOrigin = parseOrigin(mcpBaseUrl, 'MCP_BASE_URL')
  const baseOrigin = parseOrigin(BASE_URL, 'BASE_URL')

  if (betterAuthOrigin && platformOrigin && betterAuthOrigin === platformOrigin) pass('BETTER_AUTH_URL matches NUXT_PUBLIC_PLATFORM_DOMAIN')
  else fail('BETTER_AUTH_URL must match NUXT_PUBLIC_PLATFORM_DOMAIN', { betterAuthUrl, platformDomain })

  if (betterAuthOrigin && mcpOrigin && betterAuthOrigin === mcpOrigin) pass('BETTER_AUTH_URL matches MCP_BASE_URL')
  else fail('BETTER_AUTH_URL must match MCP_BASE_URL', { betterAuthUrl, mcpBaseUrl })

  if (baseOrigin && mcpOrigin && baseOrigin === mcpOrigin) pass('requested base URL matches MCP_BASE_URL')
  else fail('requested base URL must match MCP_BASE_URL', { baseUrl: BASE_URL, mcpBaseUrl })

  if (baseOrigin === CANONICAL_LOCAL_ORIGIN) pass('using canonical local MCP hostname')
  else skip(`non-canonical MCP base URL (${BASE_URL}); recommended default is ${CANONICAL_LOCAL_ORIGIN}`)

  const tunnelHostname = extractTunnelHostname()
  const tunnelId = extractTunnelId()
  if (!tunnelHostname) {
    fail(`could not find hostname in ${TUNNEL_CONFIG_PATH}`)
  } else if (baseOrigin && tunnelHostname === baseOrigin) {
    pass(`${TUNNEL_CONFIG_PATH} hostname matches BETTER_AUTH_URL/MCP_BASE_URL`)
  } else {
    fail(`${TUNNEL_CONFIG_PATH} hostname mismatch`, { tunnelHostname, baseUrl: BASE_URL })
  }

  if (!tunnelId) {
    fail(`could not find tunnel id in ${TUNNEL_CONFIG_PATH}`)
  } else if (tunnelId === CANONICAL_TUNNEL_ID) {
    pass(`${TUNNEL_CONFIG_PATH} uses the canonical krabiclaw-local tunnel id`)
  } else {
    fail(`${TUNNEL_CONFIG_PATH} tunnel id mismatch`, { expected: CANONICAL_TUNNEL_ID, actual: tunnelId })
  }

  const usingBearerToken = Boolean(envValue('MCP_BEARER_TOKEN'))
  const usingDevLogin = envValue('MCP_DEV_LOGIN') === '1'

  if (usingBearerToken) pass('MCP_BEARER_TOKEN is set; bearer-token replay mode enabled')
  else if (usingDevLogin) pass('MCP_DEV_LOGIN=1; headless local tunnel auth mode enabled')
  else fail('set MCP_BEARER_TOKEN or MCP_DEV_LOGIN=1 before running the local MCP harness')

  const requireSecret = true
  if (requireSecret) {
    const secret = envRequired('E2E_DEV_ROUTE_SECRET')
    if (secret) pass('E2E_DEV_ROUTE_SECRET will be sent to /api/dev/* routes')
  }

  await verifyOAuthMetadata(baseOrigin)
  await verifyDevRoutes(baseOrigin, requireSecret)
  await verifyRemoteTunnelConfig(baseOrigin)

  const childEnv = {
    ...process.env,
    BETTER_AUTH_URL: betterAuthUrl,
    NUXT_PUBLIC_PLATFORM_DOMAIN: platformDomain,
    MCP_BASE_URL: baseOrigin,
    E2E_ALLOW_DEV_ROUTES: 'true',
    MCP_DEV_LOGIN: usingBearerToken ? process.env.MCP_DEV_LOGIN ?? '' : '1',
  }

  runNodeScript('scripts/check-mcp-app-contract.mjs', ['--base-url', baseOrigin], childEnv)

  if (WRITE_SMOKE) {
    note('write smoke enabled; running authenticated edit/ops/image flows against the tunnel target')
    if (!childEnv.MCP_ALLOW_CREATE) childEnv.MCP_ALLOW_CREATE = '1'
    runNodeScript('scripts/check-mcp-edit-flow.mjs', ['--base-url', baseOrigin], childEnv)
    runNodeScript('scripts/check-mcp-ops-flow.mjs', ['--base-url', baseOrigin], childEnv)
    runNodeScript('scripts/check-mcp-image-flow.mjs', ['--base-url', baseOrigin], childEnv)
  } else {
    skip('write smoke disabled by default; rerun with --write-smoke to execute edit/ops/image workflows')
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
