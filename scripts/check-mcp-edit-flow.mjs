#!/usr/bin/env node

const BASE_URL = (process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : process.env.MCP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const SITE_ID = process.argv.includes('--site-id')
  ? process.argv[process.argv.indexOf('--site-id') + 1]
  : process.env.MCP_SITE_ID
const USER_ID = process.argv.includes('--user-id')
  ? process.argv[process.argv.indexOf('--user-id') + 1]
  : process.env.MCP_USER_ID
const MCP_VERSION = process.env.MCP_PROTOCOL_VERSION ?? '2026-07-28'

const isLocal = (() => { try { const h = new URL(BASE_URL).hostname; return h === 'localhost' || h === '127.0.0.1'; } catch { return false; } })()
const allowCreate = isLocal || process.env.MCP_ALLOW_CREATE === '1'
let failed = false

function pass(message) {
  console.log(`ok  ${message}`)
}

function fail(message, detail) {
  failed = true
  console.error(`not ok  ${message}`)
  if (detail) console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2))
}

async function getAuthHeaders() {
  if (process.env.MCP_BEARER_TOKEN) {
    return { authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}` }
  }

  if (!isLocal && process.env.MCP_DEV_LOGIN !== '1') {
    throw new Error('Set MCP_BEARER_TOKEN for remote checks, or MCP_DEV_LOGIN=1 for a local tunnel.')
  }

  const url = new URL('/api/dev/login', BASE_URL)
  if (USER_ID) {
    url.searchParams.set('userId', USER_ID)
  } else if (!SITE_ID) {
    url.searchParams.set('userId', `mcp-edit-${Date.now()}`)
  }

  const headers = {}
  if (process.env.E2E_DEV_ROUTE_SECRET) headers['x-dev-route-secret'] = process.env.E2E_DEV_ROUTE_SECRET

  const res = await fetch(url, { headers, redirect: 'manual' })
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error(`Dev login did not return a session cookie. Status: ${res.status}`)
  return { cookie }
}

async function mcp(headers, name, args = {}) {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': 'tools/call',
      'mcp-name': name,
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${name}-${Date.now()}`,
      method: 'tools/call',
      params: { name, arguments: args },
      _meta: {
        'io.modelcontextprotocol/version': MCP_VERSION,
        'io.modelcontextprotocol/method': 'tools/call',
        'io.modelcontextprotocol/name': name,
      },
    }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

function resultData(body) {
  if (body?.result?.structuredContent) return body.result.structuredContent
  const text = body?.result?.content?.[0]?.text
  if (!text) return body
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function expectStatus(label, response, expected = 200) {
  if (response.status === expected) pass(label)
  else fail(`${label}: expected ${expected}, got ${response.status}`, response.body)
}

function expectValue(label, condition, detail) {
  if (condition) pass(label)
  else fail(label, detail)
}

function findHero(content) {
  return Array.isArray(content?.fields)
    ? content.fields.find(item => item?.field === 'hero')
    : null
}

async function main() {
  console.log(`Checking MCP edit flow at ${BASE_URL}`)
  const headers = await getAuthHeaders()

  const welcome = await mcp(headers, 'list_sites')
  expectStatus('list_sites succeeds', welcome)
  const welcomeData = resultData(welcome.body)
  if (Array.isArray(welcomeData?.sites)) pass('list_sites returns sites array')
  else fail('list_sites did not return sites array', welcome.body)

  let siteId = SITE_ID
  if (!siteId) {
    if (!allowCreate) {
      throw new Error('Refusing to create a site on a non-local target. Pass --site-id or set MCP_ALLOW_CREATE=1.')
    }
    const suffix = Date.now()
    const create = await mcp(headers, 'create_site', {
      name: `MCP Edit Check ${suffix}`,
      subdomain: `mcp-edit-check-${suffix}`,
      vertical: 'restaurant',
    })
    expectStatus('create_site succeeds', create)
    siteId = resultData(create.body)?.siteId
    if (siteId) pass(`created test site ${siteId}`)
    else fail('create_site did not return siteId', create.body)
  }

  if (!siteId) process.exit(1)

  const list = await mcp(headers, 'list_sites')
  expectStatus('list_sites succeeds', list)
  const sites = resultData(list.body)?.sites ?? []
  if (sites.some(site => site?.id === siteId)) pass('list_sites includes editable site')
  else fail('list_sites does not include editable site', { siteId, sites })

  const setWorkspace = await mcp(headers, 'set_workspace_context', { site_id: siteId })
  expectStatus('set_workspace_context succeeds', setWorkspace)
  const setWorkspaceData = resultData(setWorkspace.body)
  expectValue('set_workspace_context stores active site', setWorkspaceData?.context?.site_id === siteId, setWorkspaceData)

  const getWorkspace = await mcp(headers, 'get_workspace_context')
  expectStatus('get_workspace_context succeeds', getWorkspace)
  const workspaceData = resultData(getWorkspace.body)
  expectValue('get_workspace_context returns active site', workspaceData?.context?.site_id === siteId, workspaceData)
  expectValue('get_workspace_context marks one active site', Array.isArray(workspaceData?.sites) && workspaceData.sites.some(site => site?.id === siteId && site?.active === true), workspaceData)

  const draftTitle = `MCP edit check ${Date.now()}`
  const save = await mcp(headers, 'update_page_content', {
    page: 'home',
    changes: {
      'hero.title': draftTitle,
      'hero.subtitle': 'Edited through MCP edit-flow checker',
    },
  })
  expectStatus('update_page_content succeeds', save)
  const saveData = resultData(save.body)
  expectValue('update_page_content echoes active site context', saveData?.context?.site_id === siteId, saveData)

  const content = await mcp(headers, 'get_page_fields', { page: 'home' })
  expectStatus('get_page_fields succeeds', content)
  const hero = findHero(resultData(content.body))
  if (hero?.hero_title === draftTitle) pass('canonical content includes updated hero title')
  else fail('canonical content did not include updated hero title', hero)

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
