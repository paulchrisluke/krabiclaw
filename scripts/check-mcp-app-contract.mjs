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
const MCP_VERSION = process.env.MCP_PROTOCOL_VERSION ?? '2025-06-18'

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

async function request(method, params = {}, authHeaders = {}, options = {}) {
  const payload = {
    jsonrpc: '2.0',
    method,
    params,
    _meta: {
      'io.modelcontextprotocol/version': MCP_VERSION,
      'io.modelcontextprotocol/method': method,
      ...(method === 'tools/call' && params.name ? { 'io.modelcontextprotocol/name': String(params.name) } : {}),
    },
  }
  if (!options.omitId) {
    payload.id = `${method}-${Date.now()}`
  }

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': method,
      ...(method === 'tools/call' && params.name ? { 'mcp-name': String(params.name) } : {}),
      ...authHeaders,
    },
    body: JSON.stringify(payload),
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
  if (init.body?.result?.protocolVersion === MCP_VERSION) pass('initialize negotiates requested protocol version')
  else fail('initialize negotiated unexpected protocol version', init.body)

  const initialized = await request('notifications/initialized', {}, headers, { omitId: true })
  expectStatus('notifications/initialized is accepted', initialized.res.status, 202)

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
  else skip('no render tools advertised; Client MCP currently uses structured text results')

  for (const tool of renderTools) {
    const standardUri = tool._meta?.ui?.resourceUri
    const openaiUri = tool._meta?.['openai/outputTemplate']
    if (standardUri && standardUri === openaiUri) pass(`${tool.name} has matching ui.resourceUri and openai/outputTemplate`)
    else fail(`${tool.name} metadata mismatch`, tool._meta)
  }
  const openVideoTool = toolList.find(tool => tool?.name === 'open_video_upload')
  if (openVideoTool) {
    pass('open_video_upload is advertised')
    if (openVideoTool.outputSchema?.required?.length === 1 && openVideoTool.outputSchema.required[0] === 'launched') {
      pass('open_video_upload output requires launched only')
    } else {
      fail('open_video_upload has unexpected output required fields', openVideoTool.outputSchema)
    }
    const outputProperties = Object.keys(openVideoTool.outputSchema?.properties ?? {})
    if (outputProperties.length === 1 && outputProperties[0] === 'launched' && openVideoTool.outputSchema?.additionalProperties === false) {
      pass('open_video_upload output schema is exact')
    } else {
      fail('open_video_upload output schema is not exact', openVideoTool.outputSchema)
    }
  } else {
    fail('open_video_upload is not advertised')
  }

  const resources = await request('resources/list', {}, headers)
  expectStatus('resources/list succeeds', resources.res.status, 200)
  const resourceList = resources.body?.result?.resources ?? []
  if (resourceList.length > 0) pass(`found ${resourceList.length} MCP resources`)
  else skip('no resources advertised; Client MCP currently uses structured text results only')

  for (const resource of resourceList) {
    if (resource.mimeType === 'text/html;profile=mcp-app') pass(`${resource.uri} uses MCP Apps MIME type`)
    else fail(`${resource.uri} has wrong MIME type`, resource.mimeType)

    const read = await request('resources/read', { uri: resource.uri }, headers)
    expectStatus(`resources/read ${resource.uri} succeeds`, read.res.status, 200)
    const content = read.body?.result?.contents?.[0]
    if (content?.mimeType === 'text/html;profile=mcp-app') pass(`${resource.uri} read content uses MCP Apps MIME type`)
    else fail(`${resource.uri} read content has wrong MIME type`, content)
    if (content?._meta?.ui?.csp?.resourceDomains?.length && content?._meta?.ui?.csp?.connectDomains?.length) {
      pass(`${resource.uri} declares standard CSP metadata`)
    }
    else fail(`${resource.uri} missing standard CSP metadata`, content?._meta)
    if (content?._meta?.ui?.domain) pass(`${resource.uri} declares ui.domain`)
    else fail(`${resource.uri} missing ui.domain`, content?._meta)
    if (content?._meta?.['openai/widgetDomain'] === content?._meta?.ui?.domain) {
      pass(`${resource.uri} keeps openai/widgetDomain aligned with ui.domain`)
    } else {
      fail(`${resource.uri} widget domain metadata mismatch`, content?._meta)
    }
    const widgetCsp = content?._meta?.['openai/widgetCSP']
    if (widgetCsp?.resource_domains?.length && widgetCsp?.connect_domains?.length) {
      pass(`${resource.uri} declares OpenAI widget CSP metadata`)
    } else {
      fail(`${resource.uri} missing OpenAI widget CSP metadata`, content?._meta)
    }

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

  const malformedCall = await request('tools/call', { name: 'open_video_upload', arguments: null }, headers)
  expectStatus('malformed tools/call arguments return JSON-RPC envelope', malformedCall.res.status, 200)
  if (malformedCall.body?.error?.code === -32602 && String(malformedCall.body?.error?.message ?? '').includes('arguments must be an object')) {
    pass('malformed tools/call arguments are non-terminating JSON-RPC invalidParams')
  } else {
    fail('malformed tools/call arguments did not return JSON-RPC invalidParams', malformedCall.body)
  }

  const staleUploadTool = await request('tools/call', { name: 'open_media_upload', arguments: {} }, headers)
  expectStatus('stale open_media_upload call returns JSON-RPC envelope', staleUploadTool.res.status, 200)
  if (staleUploadTool.body?.error?.code === -32601) {
    pass('stale open_media_upload returns non-terminating methodNotFound')
  } else {
    fail('stale open_media_upload did not return JSON-RPC methodNotFound', staleUploadTool.body)
  }

  const firstSite = welcome.body?.result?.structuredContent?.sites?.find(site => typeof site?.id === 'string')
  if (firstSite?.id && openVideoTool) {
    const launch = await request('tools/call', { name: 'open_video_upload', arguments: { site_id: firstSite.id, category: 'other' } }, headers)
    expectStatus('open_video_upload tools/call succeeds', launch.res.status, 200)
    const structured = launch.body?.result?.structuredContent
    if (
      structured?.launched === true
      && Object.keys(structured).length === 1
      && launch.body?.result?._meta?.resourceUri === openVideoTool._meta?.ui?.resourceUri
      && launch.body?.result?._meta?.context?.site_id === firstSite.id
    ) {
      pass('open_video_upload returns schema-valid structuredContent and private widget context')
    } else {
      fail('open_video_upload returned unexpected widget launch payload', launch.body)
    }
  } else {
    skip('open_video_upload launch check needs an authenticated account with at least one site')
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
