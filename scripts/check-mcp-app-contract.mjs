#!/usr/bin/env node

import { authHeaders, BASE_URL, credentialsConfigured, expectStatus, fail, finish, pass, request, run, skip } from './utils/mcp-check.mjs'

const MCP_VERSION = process.env.MCP_PROTOCOL_VERSION ?? '2025-06-18'

function scriptUrls(html) {
  return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1])
}

async function main() {
  console.log(`Checking MCP Apps contract at ${BASE_URL}`)

  const unauth = await request('tools/list')
  expectStatus('unauthenticated tools/list returns 401', unauth, 401)
  const wwwAuth = unauth.res.headers.get('www-authenticate') ?? ''
  if (wwwAuth.includes('resource_metadata=')) pass('WWW-Authenticate includes resource_metadata')
  else fail('WWW-Authenticate missing resource_metadata', wwwAuth)

  const unauthTool = await request('tools/call', { name: 'list_organizations', arguments: {} })
  expectStatus('unauthenticated tools/call returns JSON-RPC auth result', unauthTool, 200)
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

  if (!credentialsConfigured) {
    skip('authenticated checks need MCP_BEARER_TOKEN, local credentials, or MCP_CREDENTIAL_LOGIN=1 for a tunnel')
    finish()
  }
  const headers = await authHeaders()

  const init = await request('initialize', { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: 'krabiclaw-contract-check', version: '0.1.0' } }, headers)
  expectStatus('initialize succeeds', init, 200)
  if (init.body?.result?.capabilities?.tools) pass('initialize advertises tools capability')
  else fail('initialize did not advertise tools capability', init.body)
  if (init.body?.result?.protocolVersion === MCP_VERSION) pass('initialize negotiates requested protocol version')
  else fail('initialize negotiated unexpected protocol version', init.body)

  const initialized = await request('notifications/initialized', {}, headers, { omitId: true })
  expectStatus('notifications/initialized is accepted', initialized, 202)

  const tools = await request('tools/list', {}, headers)
  expectStatus('tools/list succeeds', tools, 200)
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
  if (renderTools.length === 0) pass('no render tools are advertised in tools/list')
  else fail('render tools must be attached to tool results, not tools/list', renderTools.map(tool => tool.name))

  for (const tool of renderTools) {
    const standardUri = tool._meta?.ui?.resourceUri
    const openaiUri = tool._meta?.['openai/outputTemplate']
    if (standardUri && standardUri === openaiUri) pass(`${tool.name} has matching ui.resourceUri and openai/outputTemplate`)
    else fail(`${tool.name} metadata mismatch`, tool._meta)
  }
  const staleUploadLaunchers = toolList.filter(tool => /^open_.*upload$/.test(tool?.name ?? ''))
  if (staleUploadLaunchers.length === 0) pass('no widget upload launcher tools are advertised')
  else fail('stale widget upload launcher tools are advertised', staleUploadLaunchers.map(tool => tool.name))

  const resources = await request('resources/list', {}, headers)
  expectStatus('resources/list succeeds', resources, 200)
  const resourceList = resources.body?.result?.resources ?? []
  if (resourceList.length === 0) pass('no MCP app resources are advertised')
  else fail(`unexpected MCP app resources advertised`, resourceList)

  for (const resource of resourceList) {
    if (resource.mimeType === 'text/html;profile=mcp-app') pass(`${resource.uri} uses MCP Apps MIME type`)
    else fail(`${resource.uri} has wrong MIME type`, resource.mimeType)

    const read = await request('resources/read', { uri: resource.uri }, headers)
    expectStatus(`resources/read ${resource.uri} succeeds`, read, 200)
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

  const welcome = await request('tools/call', { name: 'list_organizations', arguments: {} }, headers)
  expectStatus('list_organizations tools/call succeeds', welcome, 200)
  if (welcome.body?.result?.structuredContent && Array.isArray(welcome.body.result.structuredContent.organizations)) {
    pass('list_organizations returns structuredContent.organizations')
  } else {
    fail('list_organizations missing structuredContent.organizations', welcome.body)
  }

  const malformedCall = await request('tools/call', { name: 'save_media_attachment', arguments: null }, headers)
  expectStatus('malformed tools/call arguments return JSON-RPC envelope', malformedCall, 200)
  if (malformedCall.body?.error?.code === -32602 && String(malformedCall.body?.error?.message ?? '').includes('"arguments"')) {
    pass('malformed tools/call arguments are non-terminating JSON-RPC invalidParams')
  } else {
    fail('malformed tools/call arguments did not return JSON-RPC invalidParams', malformedCall.body)
  }

}

run(main)
