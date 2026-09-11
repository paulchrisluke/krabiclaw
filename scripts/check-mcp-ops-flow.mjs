#!/usr/bin/env node

import { credentialSession } from './utils/e2e-auth.mjs'

const BASE_URL = (process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : process.env.MCP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const SITE_ID = process.argv.includes('--site-id')
  ? process.argv[process.argv.indexOf('--site-id') + 1]
  : process.env.MCP_SITE_ID
const LOCATION_ID = process.argv.includes('--location-id')
  ? process.argv[process.argv.indexOf('--location-id') + 1]
  : process.env.MCP_LOCATION_ID
const USER_ID = process.argv.includes('--user-id')
  ? process.argv[process.argv.indexOf('--user-id') + 1]
  : process.env.MCP_USER_ID
const MCP_VERSION = process.env.MCP_PROTOCOL_VERSION ?? '2025-06-18'

const isLocal = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1')
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
  return credentialSession(BASE_URL, { userId: USER_ID || 'user-e2e-demo-owner' })
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


async function main() {
  console.log(`Checking MCP operations flow at ${BASE_URL}`)
  const headers = await getAuthHeaders()
  const siteId = SITE_ID
  if (!siteId) throw new Error('Pass --site-id for a disposable site provisioned through local setup or the CMS.')
  if (!siteId) process.exit(1)

  const locationId = LOCATION_ID
  if (!locationId) throw new Error('Pass --location-id for a disposable location provisioned through the CMS.')

  // Collections group Products for a site; membership and its order live on the
  // membership row, not on the Product.
  const collectionIds = new Map()
  for (const name of ['Mains', 'Shots']) {
    const collection = await mcp(headers, 'create_collection', { site_id: siteId, name })
    expectStatus(`create_collection ${name} succeeds`, collection)
    const collectionId = data(collection.body)?.collection?.id
    expectValue('create_collection returns collection id', Boolean(collectionId), collection.body)
    collectionIds.set(name, collectionId)
  }

  const product = await mcp(headers, 'create_product', {
    site_id: siteId,
    name: 'MCP Ops Curry',
    variants: [{ name: 'Standard', prices: [{ unit_amount: 1250, currency: 'USD' }] }],
  })
  expectStatus('create_product with price succeeds', product)
  const productId = data(product.body)?.product?.id
  expectValue('create_product returns Product id', Boolean(productId), product.body)

  // Publication and location membership are separate states; neither implies
  // the other, and a read must show both.
  expectStatus('set_product_publication succeeds', await mcp(headers, 'set_product_publication', { site_id: siteId, product_id: productId, published: true }))
  expectStatus('set_product_location succeeds', await mcp(headers, 'set_product_location', { site_id: siteId, product_id: productId, location_id: locationId, active: true, published: true }))
  expectStatus('set_collection_products succeeds', await mcp(headers, 'set_collection_products', { site_id: siteId, collection_id: collectionIds.get('Mains'), product_ids: [productId] }))

  const initialRead = await mcp(headers, 'get_product', { site_id: siteId, product_id: productId })
  expectStatus('get_product succeeds after create', initialRead)
  expectValue('created Product has initial Price on its variant', data(initialRead.body)?.product?.variants?.[0]?.prices?.[0]?.unit_amount === 1250, initialRead.body)

  const batch = await mcp(headers, 'batch_create_products', {
    site_id: siteId,
    products: [
      { name: 'B-52', variants: [{ name: 'Standard', prices: [{ unit_amount: 700, currency: 'USD' }] }] },
      { name: 'Lemon Drop', variants: [{ name: 'Standard', prices: [{ unit_amount: 800, currency: 'USD' }] }] },
    ],
  })
  expectStatus('batch_create_products succeeds', batch)
  expectValue('batch_create_products adds two Products atomically', data(batch.body)?.products?.length === 2, batch.body)

  const productUpdate = await mcp(headers, 'update_product', {
    site_id: siteId,
    product_id: productId,
    name: 'MCP Ops Green Curry',
    variants: [{ name: 'Standard', prices: [{ unit_amount: 1300, currency: 'USD' }] }],
  })
  expectStatus('update_product price succeeds', productUpdate)

  const productRead = await mcp(headers, 'get_product', { site_id: siteId, product_id: productId })
  expectStatus('get_product succeeds', productRead)
  expectValue('get_product includes updated Product', data(productRead.body)?.product?.name === 'MCP Ops Green Curry', productRead.body)
  expectValue('get_product reports where the Product is offered', (data(productRead.body)?.product?.locations ?? []).some(entry => entry.location_id === locationId && entry.published), productRead.body)
  expectValue('updated Product has replacement Price', data(productRead.body)?.product?.variants?.[0]?.prices?.[0]?.unit_amount === 1300, productRead.body)
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

  // A bookable Product is a Product: same tool, same shape. Booking is a
  // capability configured on it, not a second kind of row.
  const bookable = await mcp(headers, 'create_product', {
    site_id: siteId,
    name: 'MCP Ops Kayak Tour',
    description: 'Half-day tour created by MCP ops checker',
    variants: [{ name: 'Per person', prices: [{ unit_amount: 150000, currency: 'THB' }] }],
  })
  expectStatus('create_product (bookable) succeeds', bookable)
  const bookableId = data(bookable.body)?.product?.id
  expectValue('create_product (bookable) returns Product id', Boolean(bookableId), bookable.body)

  const invalidProduct = await mcp(headers, 'create_product', { site_id: siteId, name: '' })
  expectStatus('create_product rejects an empty name over JSON-RPC transport', invalidProduct)
  expectValue('create_product invalid name returns tool error', invalidProduct.body?.result?.isError === true, invalidProduct.body)

  const bookableUpdate = await mcp(headers, 'update_product', {
    site_id: siteId,
    product_id: bookableId,
    description: 'Updated through MCP ops checker',
  })
  expectStatus('update_product (bookable) succeeds', bookableUpdate)

  const listed = await mcp(headers, 'list_products', { site_id: siteId })
  expectStatus('list_products succeeds', listed)
  const listedProduct = (data(listed.body)?.products ?? []).find(item => item.id === bookableId)
  expectValue('list_products includes the created Product', Boolean(listedProduct), listed.body)
  expectValue('update_product keeps the updated description', listedProduct?.description === 'Updated through MCP ops checker', listedProduct)

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
