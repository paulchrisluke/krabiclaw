#!/usr/bin/env node

import sharp from 'sharp'
import crypto from 'node:crypto'

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

async function buildFixtureImageBase64() {
  const width = 320
  const height = 180
  const noisyImageBuffer = await sharp(crypto.randomBytes(width * height * 3), {
    raw: {
      width,
      height,
      channels: 3,
    },
  }).jpeg({ quality: 92 }).toBuffer()

  return {
    rawBase64: noisyImageBuffer.toString('base64'),
    dataUrl: `data:image/jpeg;base64,${noisyImageBuffer.toString('base64')}`,
  }
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
  return payload
}

async function createLocation(headers, siteId) {
  const response = await mcp(headers, 'create_location', {
    site_id: siteId,
    title: `MCP Image Check Location ${Date.now()}`,
  })
  expectStatus('create_location succeeds', response)
  const locationId = data(response.body)?.location?.id
  expectValue('create_location returns location id', Boolean(locationId), response.body)
  return locationId
}

async function createMenuAndItem(headers, siteId) {
  const menu = await mcp(headers, 'create_menu', {
    site_id: siteId,
    name: `MCP Image Menu ${Date.now()}`,
  })
  expectStatus('create_menu succeeds', menu)
  const menuId = data(menu.body)?.menu?.id
  expectValue('create_menu returns menu id', Boolean(menuId), menu.body)

  const item = await mcp(headers, 'create_menu_item', {
    site_id: siteId,
    menu_id: menuId,
    name: 'MCP Image Dish',
    description: 'Used for image tool coverage',
    section: 'Main',
    price_amount: '12.00',
  })
  expectStatus('create_menu_item succeeds', item)
  const itemId = data(item.body)?.item?.id
  expectValue('create_menu_item returns item id', Boolean(itemId), item.body)
  return { itemId }
}

async function createPost(headers, siteId) {
  const response = await mcp(headers, 'create_post', {
    site_id: siteId,
    title: 'MCP Image Post',
    body: 'Post used for image tool coverage',
  })
  expectStatus('create_post succeeds', response)
  const postId = data(response.body)?.post?.id
  expectValue('create_post returns post id', Boolean(postId), response.body)
  return postId
}

async function createExperience(headers, siteId) {
  const response = await mcp(headers, 'create_experience', {
    site_id: siteId,
    title: 'MCP Image Experience',
    body: 'Experience used for image tool coverage',
    status: 'active',
  })
  expectStatus('create_experience succeeds', response)
  const experienceId = data(response.body)?.experience?.id
  expectValue('create_experience returns experience id', Boolean(experienceId), response.body)
  return experienceId
}

async function assertImageAssignmentTool(headers, name, args, expectation) {
  const response = await mcp(headers, name, args)
  expectStatus(`${name} succeeds`, response)
  const payload = data(response.body)
  expectation(payload, response.body)
}

async function main() {
  console.log(`Checking MCP image flow at ${BASE_URL}`)
  const headers = await getAuthHeaders()
  const siteId = await getOrCreateSite(headers)
  if (!siteId) process.exit(1)

  const fixture = await buildFixtureImageBase64()
  const rawBase64Image = await assertSavedImage(headers, siteId, fixture.rawBase64, 'raw-base64')
  const dataUrlImage = await assertSavedImage(headers, siteId, fixture.dataUrl, 'data-url')
  const assetId = rawBase64Image?.assetId
  expectValue('saved image fixture returns reusable assetId', Boolean(assetId), rawBase64Image)

  const locationId = await createLocation(headers, siteId)
  const workspaceSet = await mcp(headers, 'set_workspace_context', {
    site_id: siteId,
    location_id: locationId,
  })
  expectStatus('set_workspace_context with location succeeds', workspaceSet)
  const workspacePayload = data(workspaceSet.body)
  expectValue('workspace context stores active location', workspacePayload?.context?.location_id === locationId, workspacePayload)
  const { itemId } = await createMenuAndItem(headers, siteId)
  const postId = await createPost(headers, siteId)
  const experienceId = await createExperience(headers, siteId)

  await assertImageAssignmentTool(headers, 'set_logo', {
    site_id: siteId,
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_logo returns logo asset id', payload?.logo_asset_id === assetId, payload)
    expectValue('set_logo returns context', payload?.context?.site_id === siteId, payload)
  })

  await assertImageAssignmentTool(headers, 'set_home_hero_image', {
    site_id: siteId,
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_home_hero_image updates home page', payload?.page === 'home', payload)
    expectValue('set_home_hero_image returns context', payload?.context?.site_id === siteId, payload)
  })

  await assertImageAssignmentTool(headers, 'set_story_image', {
    site_id: siteId,
    asset_id: dataUrlImage?.assetId,
  }, (payload) => {
    expectValue('set_story_image updates about page', payload?.page === 'about', payload)
    expectValue('set_story_image returns context', payload?.context?.site_id === siteId, payload)
  })

  await assertImageAssignmentTool(headers, 'set_location_hero_image', {
    site_id: siteId,
    location_id: locationId,
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_location_hero_image updates location hero', payload?.location?.hero_image_asset_id === assetId, payload)
    expectValue('set_location_hero_image returns location context', payload?.context?.location_id === locationId, payload)
  })

  await assertImageAssignmentTool(headers, 'set_menu_item_image', {
    site_id: siteId,
    menu_item_id: itemId,
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_menu_item_image updates menu item image', payload?.item?.image_asset_id === assetId, payload)
    expectValue('set_menu_item_image returns site context', payload?.context?.site_id === siteId, payload)
  })

  await assertImageAssignmentTool(headers, 'set_post_image', {
    site_id: siteId,
    post_id: postId,
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_post_image updates post image', payload?.post?.image_asset_id === assetId, payload)
    expectValue('set_post_image returns site context', payload?.context?.site_id === siteId, payload)
  })

  await assertImageAssignmentTool(headers, 'set_experience_image', {
    site_id: siteId,
    experience_id: experienceId,
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_experience_image updates experience image', payload?.experience?.image_asset_id === assetId, payload)
    expectValue('set_experience_image returns site context', payload?.context?.site_id === siteId, payload)
  })

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
