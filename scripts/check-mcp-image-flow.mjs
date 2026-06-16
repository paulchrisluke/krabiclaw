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

const isLocal = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1')
const allowCreate = isLocal || process.env.MCP_ALLOW_CREATE === '1'
let failed = false

const RAW_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
const DATA_URL_PNG = `data:image/png;base64,${RAW_PNG_BASE64}`

function pass(message) {
  console.log(`ok  ${message}`)
}

function fail(message, detail) {
  failed = true
  console.error(`not ok  ${message}`)
  if (detail) console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2))
}

function expectValue(label, condition, detail) {
  if (condition) pass(label)
  else fail(label, detail)
}

function expectStatus(label, response, expected = 200) {
  if (response.status === expected) pass(label)
  else fail(`${label}: expected ${expected}, got ${response.status}`, response.body)
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
    url.searchParams.set('userId', `mcp-image-${Date.now()}`)
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

function data(body) {
  if (body?.result?.structuredContent) return body.result.structuredContent
  const text = body?.result?.content?.[0]?.text
  if (!text) return body
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function getOrCreateSite(headers) {
  if (SITE_ID) return SITE_ID
  if (!allowCreate) throw new Error('Refusing to create a site on a non-local target. Pass --site-id or set MCP_ALLOW_CREATE=1.')

  const suffix = Date.now()
  const create = await mcp(headers, 'create_site', {
    name: `MCP Image Check ${suffix}`,
    subdomain: `mcp-image-check-${suffix}`,
    vertical: 'restaurant',
  })
  expectStatus('create_site succeeds', create)
  const siteId = data(create.body)?.siteId
  expectValue('create_site returns siteId', Boolean(siteId), create.body)
  return siteId
}

async function assertResolvableImage(url, label) {
  const res = await fetch(url, { method: 'HEAD' })
  expectValue(`${label} resolves`, res.status === 200, { url, status: res.status })
  expectValue(`${label} is an image`, String(res.headers.get('content-type') || '').startsWith('image/'), {
    url,
    contentType: res.headers.get('content-type'),
  })
}

async function assertSavedImage(headers, siteId, imageData, label) {
  const response = await mcp(headers, 'save_generated_image', {
    site_id: siteId,
    image_data_base64: imageData,
    prompt: `${label} prompt`,
  })
  expectStatus(`${label} save_generated_image succeeds`, response)
  const payload = data(response.body)
  expectValue(`${label} returns assetId`, Boolean(payload?.assetId), payload)
  expectValue(`${label} returns publicUrl`, typeof payload?.publicUrl === 'string' && payload.publicUrl.startsWith('https://'), payload)
  expectValue(`${label} returns thumbnailUrl`, typeof payload?.thumbnailUrl === 'string' && payload.thumbnailUrl.startsWith('https://'), payload)
  if (payload?.publicUrl) await assertResolvableImage(payload.publicUrl, `${label} publicUrl`)
  if (payload?.thumbnailUrl) await assertResolvableImage(payload.thumbnailUrl, `${label} thumbnailUrl`)
}

async function main() {
  console.log(`Checking MCP image flow at ${BASE_URL}`)
  const headers = await getAuthHeaders()
  const siteId = await getOrCreateSite(headers)
  if (!siteId) process.exit(1)

  await assertSavedImage(headers, siteId, RAW_PNG_BASE64, 'raw-base64')
  await assertSavedImage(headers, siteId, DATA_URL_PNG, 'data-url')

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
