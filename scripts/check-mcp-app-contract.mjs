#!/usr/bin/env node

const _baseUrlArg = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : undefined
if (_baseUrlArg !== undefined && !_baseUrlArg) {
  console.error('--base-url requires a non-empty URL value')
  process.exit(1)
}
const BASE_URL = (_baseUrlArg ?? process.env.MCP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const MCP_URL = `${BASE_URL}/api/mcp`
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

async function request(method, params = {}, authHeaders = {}) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': method,
      ...(method === 'tools/call' && params.name ? { 'mcp-name': String(params.name) } : {}),
      ...authHeaders,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}-${Date.now()}`,
      method,
      params,
      _meta: {
        'io.modelcontextprotocol/version': MCP_VERSION,
        'io.modelcontextprotocol/method': method,
        ...(method === 'tools/call' && params.name ? { 'io.modelcontextprotocol/name': String(params.name) } : {}),
      },
    }),
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { res, body }
}

async function authHeaders() {
  if (process.env.MCP_BEARER_TOKEN) {
    return { authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}` }
  }

  const shouldTryDevLogin = process.env.MCP_DEV_LOGIN === '1'
    || BASE_URL.includes('localhost')
    || BASE_URL.includes('127.0.0.1')

  if (!shouldTryDevLogin) {
    return null
  }

  const headers = {}
  if (process.env.E2E_DEV_ROUTE_SECRET) {
    headers['x-dev-route-secret'] = process.env.E2E_DEV_ROUTE_SECRET
  }

  const login = await fetch(`${BASE_URL}/api/dev/login`, {
    headers,
    redirect: 'manual',
  })
  const setCookie = login.headers.get('set-cookie')
  if (!setCookie) return null
  return { cookie: setCookie.split(';')[0] }
}

function expectStatus(label, actual, expected) {
  if (actual === expected) pass(label)
  else fail(`${label}: expected ${expected}, got ${actual}`)
}

function scriptUrls(html) {
  return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1])
}

async function main() {
  console.log(`Checking MCP Apps contract at ${BASE_URL}`)

  const unauth = await request('tools/list')
  expectStatus('unauthenticated tools/list returns 401', unauth.res.status, 401)
  const wwwAuth = unauth.res.headers.get('www-authenticate') ?? ''
  if (wwwAuth.includes('resource_metadata=')) pass('WWW-Authenticate includes resource_metadata')
  else fail('WWW-Authenticate missing resource_metadata', wwwAuth)

  const unauthTool = await request('tools/call', { name: 'list_sites', arguments: {} })
  expectStatus('unauthenticated tools/call returns JSON-RPC auth result', unauthTool.res.status, 200)
  const toolChallenge = unauthTool.body?.result?._meta?.['mcp/www_authenticate']?.[0] ?? ''
  if (
    unauthTool.body?.result?.isError === true
    && toolChallenge.includes('resource_metadata=')
    && toolChallenge.includes('error="invalid_token"')
    && toolChallenge.includes('error_description=')
  ) {
    pass('unauthenticated tools/call includes mcp/www_authenticate challenge')
  } else {
    fail('unauthenticated tools/call missing mcp/www_authenticate challenge', unauthTool.body)
  }

  const headers = await authHeaders()
  if (!headers) {
    skip('authenticated checks need MCP_BEARER_TOKEN, localhost dev login, or MCP_DEV_LOGIN=1 for a local tunnel')
    process.exit(failed ? 1 : 0)
  }

  const init = await request('initialize', { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: 'krabiclaw-contract-check', version: '0.1.0' } }, headers)
  expectStatus('initialize succeeds', init.res.status, 200)
  if (init.body?.result?.capabilities?.tools) pass('initialize advertises tools capability')
  else fail('initialize did not advertise tools capability', init.body)

  const tools = await request('tools/list', {}, headers)
  expectStatus('tools/list succeeds', tools.res.status, 200)
  const toolList = tools.body?.result?.tools ?? []
  for (const tool of toolList) {
    const securitySchemes = tool.securitySchemes ?? []
    const metaSecuritySchemes = tool._meta?.securitySchemes ?? []
    const hasTenantOauth = securitySchemes.some(scheme =>
      scheme?.type === 'oauth2' && Array.isArray(scheme.scopes) && scheme.scopes.includes('tenant')
    )
    const metaMatches = JSON.stringify(securitySchemes) === JSON.stringify(metaSecuritySchemes)
    if (hasTenantOauth && metaMatches) pass(`${tool.name} declares tenant OAuth security scheme`)
    else fail(`${tool.name} missing tenant OAuth security scheme`, { securitySchemes, metaSecuritySchemes })
  }
  const renderTools = toolList.filter(tool => tool?._meta?.ui?.resourceUri || tool?._meta?.['openai/outputTemplate'])
  if (renderTools.length > 0) pass(`found ${renderTools.length} render tools`)
  else skip('no render tools advertised; widgets are currently disabled by design')

  for (const tool of renderTools) {
    const standardUri = tool._meta?.ui?.resourceUri
    const openaiUri = tool._meta?.['openai/outputTemplate']
    if (standardUri && standardUri === openaiUri) pass(`${tool.name} has matching ui.resourceUri and openai/outputTemplate`)
    else fail(`${tool.name} metadata mismatch`, tool._meta)
  }

  const resources = await request('resources/list', {}, headers)
  expectStatus('resources/list succeeds', resources.res.status, 200)
  const resourceList = resources.body?.result?.resources ?? []
  if (resourceList.length > 0) pass(`found ${resourceList.length} widget resources`)
  else fail('no widget resources advertised', resources.body)

  for (const resource of resourceList) {
    if (resource.mimeType === 'text/html;profile=mcp-app') pass(`${resource.uri} uses MCP Apps MIME type`)
    else fail(`${resource.uri} has wrong MIME type`, resource.mimeType)

    const read = await request('resources/read', { uri: resource.uri }, headers)
    expectStatus(`resources/read ${resource.uri} succeeds`, read.res.status, 200)
    const content = read.body?.result?.contents?.[0]
    if (content?.mimeType === 'text/html;profile=mcp-app') pass(`${resource.uri} read content uses MCP Apps MIME type`)
    else fail(`${resource.uri} read content has wrong MIME type`, content)
    if (content?._meta?.ui?.csp?.resourceDomains?.length) pass(`${resource.uri} declares standard CSP metadata`)
    else fail(`${resource.uri} missing standard CSP metadata`, content?._meta)

    const baseOrigin = new URL(BASE_URL).origin
    for (const src of scriptUrls(content?.text ?? '')) {
      const url = new URL(src, BASE_URL).toString()
      const isSameOrigin = new URL(url).origin === baseOrigin
      const asset = await fetch(url, isSameOrigin ? { headers } : {})
      if (asset.ok) pass(`${resource.uri} script loads: ${url}`)
      else fail(`${resource.uri} script failed: ${url} (${asset.status})`)
    }
  }

  const welcome = await request('tools/call', { name: 'list_sites', arguments: {} }, headers)
  expectStatus('list_sites tools/call succeeds', welcome.res.status, 200)
  if (welcome.body?.result?.structuredContent && Array.isArray(welcome.body.result.structuredContent.sites)) {
    pass('list_sites returns structuredContent.sites')
  } else {
    fail('list_sites missing structuredContent.sites', welcome.body)
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
