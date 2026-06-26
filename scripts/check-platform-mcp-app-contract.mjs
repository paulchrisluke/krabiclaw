#!/usr/bin/env node

const baseUrlFlagIndex = process.argv.indexOf('--base-url')
let _baseUrlArg
if (baseUrlFlagIndex !== -1) {
  _baseUrlArg = process.argv[baseUrlFlagIndex + 1]
  if (!_baseUrlArg || _baseUrlArg.startsWith('-')) {
    console.error('--base-url requires a non-flag URL value immediately after the flag')
    process.exit(1)
  }
}
const BASE_URL = (_baseUrlArg ?? process.env.MCP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const MCP_URL = `${BASE_URL}/api/mcp/platform`
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

async function main() {
  console.log(`Checking platform MCP Apps contract at ${BASE_URL}`)

  const unauth = await request('tools/list')
  expectStatus('unauthenticated tools/list returns 401', unauth.res.status, 401)
  const wwwAuth = unauth.res.headers.get('www-authenticate') ?? ''
  if (wwwAuth.includes('resource_metadata=')) pass('WWW-Authenticate includes resource_metadata')
  else fail('WWW-Authenticate missing resource_metadata', wwwAuth)
  if (wwwAuth.includes('/.well-known/oauth-protected-resource/platform-mcp')) pass('WWW-Authenticate points at platform protected resource')
  else fail('WWW-Authenticate points at wrong protected resource', wwwAuth)

  const unauthTool = await request('tools/call', { name: 'get_platform_context', arguments: {} })
  expectStatus('unauthenticated tools/call returns JSON-RPC auth result', unauthTool.res.status, 200)
  const toolChallenge = unauthTool.body?.result?._meta?.['mcp/www_authenticate']?.[0] ?? ''
  if (
    unauthTool.body?.result?.isError === true
    && toolChallenge.includes('resource_metadata=')
    && toolChallenge.includes('error="invalid_token"')
  ) {
    pass('unauthenticated tools/call includes mcp/www_authenticate challenge')
  } else {
    fail('unauthenticated tools/call missing mcp/www_authenticate challenge', unauthTool.body)
  }

  const headers = await authHeaders()
  if (!headers) {
    skip('authenticated checks need MCP_BEARER_TOKEN, localhost dev login, or MCP_DEV_LOGIN=1')
    process.exit(failed ? 1 : 0)
  }

  const init = await request('initialize', { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: 'krabiclaw-platform-contract-check', version: '0.1.0' } }, headers)
  expectStatus('initialize succeeds', init.res.status, 200)

  const tools = await request('tools/list', {}, headers)
  expectStatus('tools/list succeeds', tools.res.status, 200)
  const toolList = tools.body?.result?.tools ?? []
  const toolNames = toolList.map(tool => tool.name)
  if (toolNames.includes('list_platform_blog_posts')) pass('platform blog tools are exposed')
  else fail('platform blog tools missing', toolNames)
  if (toolNames.includes('list_sites')) fail('tenant tools leaked into platform surface', toolNames)
  else pass('tenant tools are not exposed on platform surface')

  for (const tool of toolList) {
    const securitySchemes = tool.securitySchemes ?? []
    const metaSecuritySchemes = tool._meta?.securitySchemes ?? []
    const hasPlatformOauth = securitySchemes.some(scheme =>
      scheme?.type === 'oauth2' && Array.isArray(scheme.scopes) && scheme.scopes.includes('platform_admin')
    )
    const metaMatches = JSON.stringify(securitySchemes) === JSON.stringify(metaSecuritySchemes)
    if (hasPlatformOauth && metaMatches) pass(`${tool.name} declares platform OAuth security scheme`)
    else fail(`${tool.name} missing platform OAuth security scheme`, { securitySchemes, metaSecuritySchemes })
  }

  const uploadTool = toolList.find(tool => tool.name === 'upload_platform_image')
  if (uploadTool?._meta?.['openai/fileParams']?.includes('file')) pass('upload_platform_image declares openai/fileParams')
  else fail('upload_platform_image missing openai/fileParams', uploadTool)

  const resources = await request('resources/list', {}, headers)
  expectStatus('resources/list succeeds', resources.res.status, 200)
  const resourceList = resources.body?.result?.resources ?? []
  if (resourceList.some(resource => resource.uri === 'kc://docs/product-context')) pass('product context resource is exposed')
  else fail('product context resource missing', resourceList)

  const prompts = await request('prompts/list', {}, headers)
  expectStatus('prompts/list succeeds', prompts.res.status, 200)
  const promptList = prompts.body?.result?.prompts ?? []
  if (promptList.some(prompt => prompt.name === 'audit_content_for_growth')) pass('growth audit prompt is exposed')
  else fail('growth audit prompt missing', promptList)

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
