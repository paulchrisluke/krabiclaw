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
    url.searchParams.set('userId', `mcp-ops-${Date.now()}`)
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

function expectStatus(label, response, expected = 200) {
  if (response.status === expected) pass(label)
  else fail(`${label}: expected ${expected}, got ${response.status}`, response.body)
}

function expectValue(label, condition, detail) {
  if (condition) pass(label)
  else fail(label, detail)
}

function moneyEquals(value, expected) {
  return Number(value) === Number(expected)
}

async function getOrCreateSite(headers) {
  if (SITE_ID) return SITE_ID
  if (!allowCreate) throw new Error('Refusing to create a site on a non-local target. Pass --site-id or set MCP_ALLOW_CREATE=1.')

  const suffix = Date.now()
  const create = await mcp(headers, 'create_site', {
    name: `MCP Ops Check ${suffix}`,
    subdomain: `mcp-ops-check-${suffix}`,
    vertical: 'restaurant',
  })
  expectStatus('create_site succeeds', create)
  const siteId = data(create.body)?.siteId
  expectValue('create_site returns siteId', Boolean(siteId), create.body)
  return siteId
}

async function main() {
  console.log(`Checking MCP operations flow at ${BASE_URL}`)
  const headers = await getAuthHeaders()
  const siteId = await getOrCreateSite(headers)
  if (!siteId) process.exit(1)

  const location = await mcp(headers, 'create_location', {
    site_id: siteId,
    title: `MCP Ops Location ${Date.now()}`,
  })
  expectStatus('create_location succeeds', location)
  const locationId = data(location.body)?.location?.id
  expectValue('create_location returns location id', Boolean(locationId), location.body)

  const menu = await mcp(headers, 'create_menu', {
    site_id: siteId,
    name: `MCP Ops Menu ${Date.now()}`,
    description: 'Menu created by MCP ops checker',
    location_id: locationId,
  })
  expectStatus('create_menu succeeds', menu)
  const createdMenu = data(menu.body)?.menu
  const menuId = createdMenu?.id
  expectValue('create_menu returns menu id', Boolean(menuId), menu.body)
  expectValue('create_menu preserves location_id', createdMenu?.location_id === locationId, createdMenu)

  const menuItem = await mcp(headers, 'create_menu_item', {
    site_id: siteId,
    menu_id: menuId,
    section: 'Mains',
    name: 'MCP Ops Curry',
    price_amount: '12.50',
  })
  expectStatus('create_menu_item with price succeeds', menuItem)
  const menuItemData = data(menuItem.body)?.item
  const menuItemId = menuItemData?.id
  expectValue('create_menu_item returns item id', Boolean(menuItemId), menuItem.body)
  expectValue('created menu item keeps price amount', moneyEquals(menuItemData?.price_amount, 12.5), menuItemData)

  const aliasedMenuItem = await mcp(headers, 'create_menu_item', {
    site_id: siteId,
    menu_id: menuId,
    section: 'Mains',
    name: 'MCP Alias Curry',
    price: '14.25',
  })
  expectStatus('create_menu_item with legacy price alias succeeds', aliasedMenuItem)
  const aliasedMenuItemData = data(aliasedMenuItem.body)?.item
  expectValue('legacy price alias is normalized to price_amount', moneyEquals(aliasedMenuItemData?.price_amount, 14.25), aliasedMenuItemData)

  const batchedMenuItems = await mcp(headers, 'add_menu_items_batch', {
    site_id: siteId,
    menu_id: menuId,
    items: [
      { section: 'Shots', name: 'B-52', price_amount: '7' },
      { section: 'Shots', name: 'Lemon Drop', price: '8' },
      { section: 'Shots', name: 'B-52', price_amount: '7' },
    ],
  })
  expectStatus('add_menu_items_batch succeeds', batchedMenuItems)
  const batchPayload = data(batchedMenuItems.body)
  expectValue('add_menu_items_batch adds two items', batchPayload?.added === 2, batchPayload)
  expectValue('add_menu_items_batch reports one duplicate skip', Array.isArray(batchPayload?.skipped) && batchPayload.skipped.length === 1, batchPayload)

  const itemUpdate = await mcp(headers, 'update_menu_item', {
    site_id: siteId,
    menu_item_id: menuItemId,
    name: 'MCP Ops Green Curry',
    price_amount: '13.00',
  })
  expectStatus('update_menu_item price succeeds', itemUpdate)
  const updatedItem = data(itemUpdate.body)?.item
  expectValue('updated menu item keeps new price amount', moneyEquals(updatedItem?.price_amount, 13), updatedItem)

  const menuRead = await mcp(headers, 'get_menu', { site_id: siteId, menu_id: menuId })
  expectStatus('get_menu succeeds', menuRead)
  const readItems = data(menuRead.body)?.menu?.items ?? []
  expectValue('get_menu includes updated item', readItems.some(item => item.id === menuItemId && item.name === 'MCP Ops Green Curry'), readItems)

  const menuDelete = await mcp(headers, 'delete_menu', { site_id: siteId, menu_id: menuId })
  expectStatus('delete_menu succeeds', menuDelete)
  expectValue('delete_menu returns deleted true', data(menuDelete.body)?.deleted === true, menuDelete.body)

  const post = await mcp(headers, 'create_post', {
    site_id: siteId,
    title: 'MCP Ops Post',
    body: 'Post created by MCP ops checker',
  })
  expectStatus('create_post succeeds', post)
  const postId = data(post.body)?.post?.id
  expectValue('create_post returns post id', Boolean(postId), post.body)

  const postUpdate = await mcp(headers, 'update_post', {
    site_id: siteId,
    post_id: postId,
    title: 'MCP Ops Post Updated',
    body: 'Post updated by MCP ops checker',
  })
  expectStatus('update_post succeeds', postUpdate)
  expectValue('update_post keeps updated title', data(postUpdate.body)?.post?.title === 'MCP Ops Post Updated', postUpdate.body)

  const postPublish = await mcp(headers, 'publish_post', {
    site_id: siteId,
    post_id: postId,
    channels: ['site'],
  })
  expectStatus('publish_post succeeds', postPublish)
  expectValue('publish_post returns published post', Boolean(data(postPublish.body)?.post?.id), postPublish.body)

  const socialOnlyPublish = await mcp(headers, 'publish_post', {
    site_id: siteId,
    post_id: postId,
    channels: ['facebook'],
  })
  expectStatus('publish_post with disconnected facebook returns 409', socialOnlyPublish, 409)

  const posts = await mcp(headers, 'list_posts', { site_id: siteId })
  expectStatus('list_posts succeeds', posts)
  expectValue('list_posts includes published post', (data(posts.body)?.posts ?? []).some(post => post.id === postId), posts.body)

  const experience = await mcp(headers, 'create_experience', {
    site_id: siteId,
    title: 'MCP Ops Kayak Tour',
    body: 'Half-day tour created by MCP ops checker',
    status: 'active',
    price: '1500 THB',
    time_slots: ['14:00'],
    max_capacity: 6,
  })
  expectStatus('create_experience succeeds', experience)
  const experienceId = data(experience.body)?.experience?.id
  expectValue('create_experience returns experience id', Boolean(experienceId), experience.body)

  const invalidExperience = await mcp(headers, 'create_experience', {
    site_id: siteId,
    title: 'Invalid MCP Experience Status',
    status: 'draft',
  })
  expectStatus('create_experience rejects invalid status', invalidExperience, 400)

  const experienceUpdate = await mcp(headers, 'update_experience', {
    site_id: siteId,
    experience_id: experienceId,
    tagline: 'Updated through MCP ops checker',
    price: '1750 THB',
    max_capacity: 8,
  })
  expectStatus('update_experience succeeds', experienceUpdate)
  const updatedExperience = data(experienceUpdate.body)?.experience
  expectValue('update_experience keeps updated tagline', updatedExperience?.tagline === 'Updated through MCP ops checker', updatedExperience)

  const experiences = await mcp(headers, 'list_experiences', { site_id: siteId })
  expectStatus('list_experiences succeeds', experiences)
  expectValue('list_experiences includes created experience', (data(experiences.body)?.experiences ?? []).some(item => item.id === experienceId), experiences.body)

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
