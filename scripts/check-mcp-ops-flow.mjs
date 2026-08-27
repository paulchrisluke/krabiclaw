#!/usr/bin/env node

import { credentialSession } from './utils/e2e-auth.mjs'

const BASE_URL = (process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : process.env.MCP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const SITE_ID = process.argv.includes('--site-id')
  ? process.argv[process.argv.indexOf('--site-id') + 1]
  : process.env.MCP_SITE_ID
const USER_ID = process.argv.includes('--user-id')
  ? process.argv[process.argv.indexOf('--user-id') + 1]
  : process.env.MCP_USER_ID
const MCP_VERSION = process.env.MCP_PROTOCOL_VERSION ?? '2025-06-18'

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

  if (!isLocal && process.env.MCP_CREDENTIAL_LOGIN !== '1') {
    throw new Error('Set MCP_BEARER_TOKEN for remote checks, or MCP_CREDENTIAL_LOGIN=1 for a credentialed tunnel.')
  }
  return credentialSession(BASE_URL, { userId: USER_ID || 'user-e2e-mcp-owner-c' })
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
  const locationId = data(location.body)?.id
  expectValue('create_location returns location id', Boolean(locationId), location.body)

  const product = await mcp(headers, 'create_product', {
    site_id: siteId,
    location_id: locationId,
    category: 'Mains',
    name: 'MCP Ops Curry',
    price_amount: '12.5',
  })
  expectStatus('create_product with price succeeds', product)
  const productId = data(product.body)?.product?.id
  expectValue('create_product returns Product id', Boolean(productId), product.body)

  const initialRead = await mcp(headers, 'get_product', { site_id: siteId, product_id: productId })
  expectStatus('get_product succeeds after create', initialRead)
  expectValue('created Product has initial price amount', moneyEquals(data(initialRead.body)?.product?.price_amount, 12.5), initialRead.body)

  const batch = await mcp(headers, 'batch_create_products', {
    site_id: siteId,
    location_id: locationId,
    products: [
      { category: 'Shots', name: 'B-52', price_amount: '7' },
      { category: 'Shots', name: 'Lemon Drop', price_amount: '8' },
    ],
  })
  expectStatus('batch_create_products succeeds', batch)
  expectValue('batch_create_products adds two Products atomically', data(batch.body)?.products?.length === 2, batch.body)

  const productUpdate = await mcp(headers, 'update_product', {
    site_id: siteId,
    product_id: productId,
    name: 'MCP Ops Green Curry',
    price_amount: '13',
  })
  expectStatus('update_product price succeeds', productUpdate)

  const productRead = await mcp(headers, 'get_product', { site_id: siteId, product_id: productId })
  expectStatus('get_product succeeds', productRead)
  expectValue('get_product includes updated Product', data(productRead.body)?.product?.name === 'MCP Ops Green Curry', productRead.body)
  expectValue('get_product preserves location_id', data(productRead.body)?.product?.location_id === locationId, productRead.body)
  expectValue('updated Product has new price amount', moneyEquals(data(productRead.body)?.product?.price_amount, 13), productRead.body)
  const productDelete = await mcp(headers, 'delete_product', { site_id: siteId, product_id: productId })
  expectStatus('delete_product succeeds', productDelete)
  expectValue('delete_product returns deleted true', data(productDelete.body)?.deleted === true, productDelete.body)

  const post = await mcp(headers, 'create_post', {
    site_id: siteId,
    title: 'MCP Ops Post',
    body: 'Post created by MCP ops checker',
  })
  expectStatus('create_post succeeds', post)
  const postId = data(post.body)?.id
  expectValue('create_post returns post id', Boolean(postId), post.body)

  const postUpdate = await mcp(headers, 'update_post', {
    site_id: siteId,
    post_id: postId,
    title: 'MCP Ops Post Updated',
    body: 'Post updated by MCP ops checker',
  })
  expectStatus('update_post succeeds', postUpdate)
  expectValue('update_post returns changed_fields', Array.isArray(data(postUpdate.body)?.changed_fields), postUpdate.body)

  const postPublish = await mcp(headers, 'publish_post', {
    site_id: siteId,
    post_id: postId,
    channels: ['site'],
  })
  expectStatus('publish_post succeeds', postPublish)
  expectValue('publish_post returns published post id', Boolean(data(postPublish.body)?.id), postPublish.body)

  const combinedPublish = await mcp(headers, 'publish_post', {
    site_id: siteId,
    post_id: postId,
    channels: ['site', 'facebook'],
  })
  expectStatus('publish_post keeps site success when facebook is disconnected', combinedPublish)
  const combinedOutcome = data(combinedPublish.body)?.channel_outcomes
  expectValue(
    'publish_post reports site published and facebook skipped',
    combinedOutcome?.site?.status === 'published'
      && combinedOutcome?.facebook?.status === 'skipped',
    combinedPublish.body,
  )

  const posts = await mcp(headers, 'list_posts', { site_id: siteId })
  expectStatus('list_posts succeeds', posts)
  expectValue('list_posts includes published post', (data(posts.body)?.posts ?? []).some(post => post.id === postId), posts.body)
  const publishedPost = (data(posts.body)?.posts ?? []).find(post => post.id === postId)
  expectValue('update_post keeps updated title', publishedPost?.title === 'MCP Ops Post Updated', publishedPost)

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
  const experienceId = data(experience.body)?.id
  expectValue('create_experience returns experience id', Boolean(experienceId), experience.body)

  const invalidExperience = await mcp(headers, 'create_experience', {
    site_id: siteId,
    title: 'Invalid MCP Experience Status',
    status: 'draft',
  })
  expectStatus('create_experience rejects invalid status over JSON-RPC transport', invalidExperience)
  expectValue('create_experience invalid status returns tool error', invalidExperience.body?.result?.isError === true, invalidExperience.body)
  expectValue('create_experience invalid status explains allowed statuses', String(invalidExperience.body?.result?.content?.[0]?.text ?? '').includes('active, inactive, sold_out'), invalidExperience.body)

  const experienceUpdate = await mcp(headers, 'update_experience', {
    site_id: siteId,
    experience_id: experienceId,
    tagline: 'Updated through MCP ops checker',
    price: '1750 THB',
    max_capacity: 8,
  })
  expectStatus('update_experience succeeds', experienceUpdate)
  expectValue('update_experience returns changed_fields', Array.isArray(data(experienceUpdate.body)?.changed_fields), experienceUpdate.body)

  const experiences = await mcp(headers, 'list_experiences', { site_id: siteId })
  expectStatus('list_experiences succeeds', experiences)
  expectValue('list_experiences includes created experience', (data(experiences.body)?.experiences ?? []).some(item => item.id === experienceId), experiences.body)
  const listedExperience = (data(experiences.body)?.experiences ?? []).find(item => item.id === experienceId)
  expectValue('update_experience keeps updated tagline', listedExperience?.tagline === 'Updated through MCP ops checker', listedExperience)

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
