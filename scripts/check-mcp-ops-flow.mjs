#!/usr/bin/env node

import { credentialSession } from './utils/e2e-auth.mjs'

const BASE_URL = (process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : process.env.MCP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const ORGANIZATION_ID = process.argv.includes('--organization-id')
  ? process.argv[process.argv.indexOf('--organization-id') + 1]
  : process.env.MCP_ORGANIZATION_ID
const LOCATION_ID = process.argv.includes('--location-id')
  ? process.argv[process.argv.indexOf('--location-id') + 1]
  : process.env.MCP_LOCATION_ID
const USER_ID = process.argv.includes('--user-id')
  ? process.argv[process.argv.indexOf('--user-id') + 1]
  : process.env.MCP_USER_ID

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
  // Plain JSON-RPC 2.0, as @modelcontextprotocol/server reads it: the method
  // and tool come from the body. A `_meta['io.modelcontextprotocol/...']` key
  // claims the modern envelope, which this request does not carry the rest of,
  // so the server rejected every call as an invalid message.
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${name}-${Date.now()}`,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  // The transport may answer a single result as a one-event SSE stream.
  const raw = await res.text()
  const text = (res.headers.get('content-type') ?? '').includes('text/event-stream')
    ? raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice('data:'.length).trim()).join('')
    : raw
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

// A tool that failed answers HTTP 200 with isError: true, so a status alone
// would count a refused or half-finished write as success.
function expectSuccess(label, response) {
  if (response.status === 200 && response.body?.result && response.body.result.isError !== true) pass(label)
  else fail(`${label}: expected a successful tool result, got HTTP ${response.status}`, response.body)
}

function expectValue(label, condition, detail) {
  if (condition) pass(label)
  else fail(label, detail)
}


async function main() {
  console.log(`Checking MCP operations flow at ${BASE_URL}`)
  const headers = await getAuthHeaders()
  const organizationId = ORGANIZATION_ID
  if (!organizationId) throw new Error('Pass --organization-id for a disposable organization provisioned through local setup or the CMS.')
  if (!organizationId) process.exit(1)

  const locationId = LOCATION_ID
  if (!locationId) throw new Error('Pass --location-id for a disposable location provisioned through the CMS.')

  // Collections group Products for a site; membership and its order live on the
  // membership row, not on the Product.
  const collectionIds = new Map()
  for (const name of ['Mains', 'Shots']) {
    const collection = await mcp(headers, 'create_collection', { organization_id: organizationId, name })
    expectSuccess(`create_collection ${name} succeeds`, collection)
    const collectionId = data(collection.body)?.collection?.id
    expectValue('create_collection returns collection id', Boolean(collectionId), collection.body)
    collectionIds.set(name, collectionId)
  }

  const product = await mcp(headers, 'create_product', {
    organization_id: organizationId,
    name: 'MCP Ops Curry',
    variants: [{ name: 'Standard', prices: [{ unit_amount: 1250, currency: 'USD' }] }],
  })
  expectSuccess('create_product with price succeeds', product)
  const productId = data(product.body)?.product?.id
  expectValue('create_product returns Product id', Boolean(productId), product.body)

  // Publication and location membership are separate states; neither implies
  // the other, and a read must show both.
  expectSuccess('set_product_publication succeeds', await mcp(headers, 'set_product_publication', { organization_id: organizationId, product_id: productId, published: true }))
  expectSuccess('set_product_location succeeds', await mcp(headers, 'set_product_location', { organization_id: organizationId, product_id: productId, location_id: locationId, active: true, published: true }))
  expectSuccess('set_collection_products succeeds', await mcp(headers, 'set_collection_products', { organization_id: organizationId, collection_id: collectionIds.get('Mains'), product_ids: [productId] }))

  const initialRead = await mcp(headers, 'get_product', { organization_id: organizationId, product_id: productId })
  expectSuccess('get_product succeeds after create', initialRead)
  expectValue('created Product has initial Price on its variant', data(initialRead.body)?.product?.variants?.[0]?.prices?.[0]?.unit_amount === 1250, initialRead.body)

  const batch = await mcp(headers, 'batch_create_products', {
    organization_id: organizationId,
    products: [
      { name: 'B-52', variants: [{ name: 'Standard', prices: [{ unit_amount: 700, currency: 'USD' }] }] },
      { name: 'Lemon Drop', variants: [{ name: 'Standard', prices: [{ unit_amount: 800, currency: 'USD' }] }] },
    ],
  })
  expectSuccess('batch_create_products succeeds', batch)
  expectValue('batch_create_products adds two Products atomically', data(batch.body)?.products?.length === 2, batch.body)

  const productUpdate = await mcp(headers, 'update_product', {
    organization_id: organizationId,
    product_id: productId,
    name: 'MCP Ops Green Curry',
    variants: [{ name: 'Standard', prices: [{ unit_amount: 1300, currency: 'USD' }] }],
  })
  expectSuccess('update_product price succeeds', productUpdate)

  const productRead = await mcp(headers, 'get_product', { organization_id: organizationId, product_id: productId })
  expectSuccess('get_product succeeds', productRead)
  expectValue('get_product includes updated Product', data(productRead.body)?.product?.name === 'MCP Ops Green Curry', productRead.body)
  expectValue('get_product reports where the Product is offered', (data(productRead.body)?.product?.locations ?? []).some(entry => entry.location_id === locationId && entry.published), productRead.body)
  expectValue('updated Product has replacement Price', data(productRead.body)?.product?.variants?.[0]?.prices?.[0]?.unit_amount === 1300, productRead.body)
  const productDelete = await mcp(headers, 'delete_product', { organization_id: organizationId, product_id: productId })
  expectSuccess('delete_product succeeds', productDelete)
  expectValue('delete_product returns deleted true', data(productDelete.body)?.deleted === true, productDelete.body)

  const post = await mcp(headers, 'create_post', {
    organization_id: organizationId,
    idempotency_key: `mcp-ops-post-${Date.now()}`,
    title: 'MCP Ops Post',
    body: 'Post created by MCP ops checker',
  })
  expectSuccess('create_post succeeds', post)
  const postId = data(post.body)?.post?.id
  expectValue('create_post returns post id', Boolean(postId), post.body)

  const postUpdate = await mcp(headers, 'update_post', {
    organization_id: organizationId,
    post_id: postId,
    expected_updated_at: data(post.body)?.post?.updated_at,
    title: 'MCP Ops Post Updated',
    body: 'Post updated by MCP ops checker',
  })
  expectSuccess('update_post succeeds', postUpdate)
  const updatedAt = data(postUpdate.body)?.post?.updated_at
  expectValue('update_post returns the new revision', typeof updatedAt === 'string' && updatedAt !== data(post.body)?.post?.updated_at, postUpdate.body)

  const connections = await mcp(headers, 'get_social_connections', { organization_id: organizationId })
  expectSuccess('get_social_connections succeeds', connections)
  const facebook = (data(connections.body)?.channels ?? []).find(channel => channel.channel === 'facebook')
  expectValue('get_social_connections reports facebook', Boolean(facebook), connections.body)

  const postPublish = await mcp(headers, 'publish_post', {
    organization_id: organizationId,
    post_id: postId,
    expected_updated_at: updatedAt,
    targets: [{ channel: 'organization' }],
  })
  expectSuccess('publish_post succeeds', postPublish)
  expectValue('publish_post publishes the website only', data(postPublish.body)?.ok === true
    && data(postPublish.body)?.outcomes?.length === 1
    && data(postPublish.body)?.outcomes?.[0]?.status === 'published', postPublish.body)

  if (facebook && !facebook.connected) {
    const facebookPublish = await mcp(headers, 'publish_post', {
      organization_id: organizationId,
      post_id: postId,
      expected_updated_at: data(postPublish.body)?.updated_at,
      targets: [{ channel: 'organization' }, { channel: 'facebook', target_id: 'no-page-connected', connection_revision: 'none' }],
    })
    expectSuccess('publish_post answers when facebook is not connected', facebookPublish)
    const outcomes = data(facebookPublish.body)?.outcomes ?? []
    expectValue(
      'publish_post keeps the website receipt and skips facebook with the problem get_social_connections named',
      outcomes.find(outcome => outcome.channel === 'organization')?.status === 'already_published'
        && outcomes.find(outcome => outcome.channel === 'facebook')?.status === 'skipped'
        && outcomes.find(outcome => outcome.channel === 'facebook')?.code === facebook.problems?.[0]?.code
        && data(facebookPublish.body)?.ok === false,
      facebookPublish.body,
    )
  }

  const posts = await mcp(headers, 'list_posts', { organization_id: organizationId })
  expectSuccess('list_posts succeeds', posts)
  expectValue('list_posts includes published post', (data(posts.body)?.posts ?? []).some(post => post.id === postId), posts.body)
  const publishedPost = (data(posts.body)?.posts ?? []).find(post => post.id === postId)
  expectValue('update_post keeps updated title', publishedPost?.title === 'MCP Ops Post Updated', publishedPost)

  // A bookable Product is a Product: same tool, same shape. Booking is a
  // capability configured on it, not a second kind of row.
  const bookable = await mcp(headers, 'create_product', {
    organization_id: organizationId,
    name: 'MCP Ops Kayak Tour',
    description: 'Half-day tour created by MCP ops checker',
    variants: [{ name: 'Per person', prices: [{ unit_amount: 150000, currency: 'THB' }] }],
  })
  expectSuccess('create_product (bookable) succeeds', bookable)
  const bookableId = data(bookable.body)?.product?.id
  expectValue('create_product (bookable) returns Product id', Boolean(bookableId), bookable.body)

  const invalidProduct = await mcp(headers, 'create_product', { organization_id: organizationId, name: '' })
  expectValue('create_product rejects an empty name over JSON-RPC transport', invalidProduct.status === 200, invalidProduct.body)
  expectValue('create_product invalid name returns tool error', invalidProduct.body?.result?.isError === true, invalidProduct.body)

  const bookableUpdate = await mcp(headers, 'update_product', {
    organization_id: organizationId,
    product_id: bookableId,
    description: 'Updated through MCP ops checker',
  })
  expectSuccess('update_product (bookable) succeeds', bookableUpdate)

  const listed = await mcp(headers, 'list_products', { organization_id: organizationId })
  expectSuccess('list_products succeeds', listed)
  const listedProduct = (data(listed.body)?.products ?? []).find(item => item.id === bookableId)
  expectValue('list_products includes the created Product', Boolean(listedProduct), listed.body)
  expectValue('update_product keeps the updated description', listedProduct?.description === 'Updated through MCP ops checker', listedProduct)

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
