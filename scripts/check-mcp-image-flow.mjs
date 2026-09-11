#!/usr/bin/env node

import sharp from 'sharp'
import crypto from 'node:crypto'
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
  expectValue(`${label} returns asset_id`, Boolean(payload?.asset_id), payload)
  expectValue(`${label} returns public_url`, typeof payload?.public_url === 'string' && payload.public_url.startsWith('https://'), payload)
  expectValue(`${label} returns thumbnail_url`, typeof payload?.thumbnail_url === 'string' && payload.thumbnail_url.startsWith('https://'), payload)
  if (payload?.public_url) await assertResolvableImage(payload.public_url, `${label} public_url`)
  if (payload?.thumbnail_url) await assertResolvableImage(payload.thumbnail_url, `${label} thumbnail_url`)
  return payload
}


async function createProduct(headers, siteId, locationId) {
  const product = await mcp(headers, 'create_product', {
    site_id: siteId,
    name: 'MCP Image Dish',
    description: 'Used for image tool coverage',
    variants: [{ name: 'Standard', prices: [{ unit_amount: 1200, currency: 'USD' }] }],
  })
  expectStatus('create_product succeeds', product)
  const productId = data(product.body)?.product?.id
  expectValue('create_product returns Product id', Boolean(productId), product.body)
  // Publication and location membership are separate rows; a Product nobody
  // published is not on the site, which is what the image checks read back.
  expectStatus('set_product_publication succeeds', await mcp(headers, 'set_product_publication', { site_id: siteId, product_id: productId, published: true }))
  expectStatus('set_product_location succeeds', await mcp(headers, 'set_product_location', { site_id: siteId, product_id: productId, location_id: locationId, active: true, published: true }))
  return productId
}

async function createPost(headers, siteId) {
  const response = await mcp(headers, 'create_post', {
    site_id: siteId,
    title: 'MCP Image Post',
    body: 'Post used for image tool coverage',
  })
  expectStatus('create_post succeeds', response)
  const postId = data(response.body)?.id
  expectValue('create_post returns post id', Boolean(postId), response.body)
  return postId
}

async function createSecondProduct(headers, siteId) {
  const response = await mcp(headers, 'create_product', {
    site_id: siteId,
    name: 'MCP Image Class',
    description: 'Second Product used for image tool coverage',
    variants: [{ name: 'Standard', prices: [{ unit_amount: 4500, currency: 'USD' }] }],
  })
  expectStatus('create_product (second) succeeds', response)
  const id = data(response.body)?.product?.id
  expectValue('create_product (second) returns Product id', Boolean(id), response.body)
  return id
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
  const siteId = SITE_ID
  if (!siteId) throw new Error('Pass --site-id for a disposable site provisioned through local setup or the CMS.')
  if (!siteId) process.exit(1)

  const fixture = await buildFixtureImageBase64()
  const rawBase64Image = await assertSavedImage(headers, siteId, fixture.rawBase64, 'raw-base64')
  const dataUrlImage = await assertSavedImage(headers, siteId, fixture.dataUrl, 'data-url')
  const assetId = rawBase64Image?.asset_id
  const secondAssetId = dataUrlImage?.asset_id
  expectValue('saved image fixture returns reusable asset_id', Boolean(assetId), rawBase64Image)
  expectValue('saved image fixture returns second reusable asset_id', Boolean(secondAssetId), dataUrlImage)

  const locationId = LOCATION_ID
  if (!locationId) throw new Error('Pass --location-id for a disposable location provisioned through the CMS.')
  const workspaceSet = await mcp(headers, 'set_workspace_context', {
    site_id: siteId,
    location_id: locationId,
  })
  expectStatus('set_workspace_context with location succeeds', workspaceSet)
  const workspacePayload = data(workspaceSet.body)
  expectValue('workspace context stores active location', workspacePayload?.context?.location_id === locationId, workspacePayload)
  const productId = await createProduct(headers, siteId, locationId)
  const postId = await createPost(headers, siteId)
  const secondProductId = await createSecondProduct(headers, siteId)

  await assertImageAssignmentTool(headers, 'set_media', {
    site_id: siteId,
    placement: { owner_type: 'site', owner_id: siteId, slot: 'logo' },
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_media site_logo returns asset id', payload?.asset_ids?.[0] === assetId, payload)
    expectValue('set_media site_logo returns context', payload?.context?.site_id === siteId, payload)
  })

  await assertImageAssignmentTool(headers, 'set_media', {
    site_id: siteId,
    placement: { owner_type: 'business_location', owner_id: locationId, slot: 'hero' },
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_media location_hero returns location id', payload?.id === locationId, payload)
    expectValue('set_media location_hero returns location context', payload?.context?.location_id === locationId, payload)
  })

  await assertImageAssignmentTool(headers, 'attach_media', {
    site_id: siteId,
    placement: { owner_type: 'product', owner_id: productId, slot: 'gallery' },
    asset_id: assetId,
  }, (payload) => {
    expectValue('attach_media Product gallery returns Product id', payload?.id === productId, payload)
    expectValue('attach_media Product gallery returns site context', payload?.context?.site_id === siteId, payload)
  })

  await assertImageAssignmentTool(headers, 'attach_media', {
    site_id: siteId,
    placement: { owner_type: 'product', owner_id: productId, slot: 'gallery' },
    asset_id: secondAssetId,
  }, (payload) => {
    expectValue('attach_media second Product gallery asset appends', JSON.stringify(payload?.asset_ids) === JSON.stringify([assetId, secondAssetId]), payload)
  })

  await assertImageAssignmentTool(headers, 'set_media', {
    site_id: siteId,
    placement: { owner_type: 'product', owner_id: productId, slot: 'image' },
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_media Product primary returns Product id', payload?.id === productId, payload)
  })

  await assertImageAssignmentTool(headers, 'set_media', {
    site_id: siteId,
    placement: { owner_type: 'content_document', owner_id: postId, slot: 'cover' },
    asset_id: assetId,
  }, (payload) => {
    expectValue('set_media post_image returns post id', payload?.id === postId, payload)
    expectValue('set_media post_image returns site context', payload?.context?.site_id === siteId, payload)
  })

  await assertImageAssignmentTool(headers, 'attach_media', {
    site_id: siteId,
    placement: { owner_type: 'product', owner_id: secondProductId, slot: 'gallery' },
    asset_id: assetId,
  }, (payload) => {
    expectValue('attach_media second Product gallery returns its id', payload?.id === secondProductId, payload)
    expectValue('attach_media second Product gallery returns site context', payload?.context?.site_id === siteId, payload)
  })

  const locationRead = await mcp(headers, 'get_location', {
    site_id: siteId,
    location_id: locationId,
  })
  expectStatus('get_location succeeds', locationRead)
  expectValue('set_media updates location hero', data(locationRead.body)?.location?.media?.some(media => media.slot === 'hero' && media.asset_id === assetId), data(locationRead.body))

  const productRead = await mcp(headers, 'get_product', {
    site_id: siteId,
    product_id: productId,
  })
  const readProduct = data(productRead.body)?.product
  expectStatus('get_product for image verification succeeds', productRead)
  expectValue(
    'attach_media updates ordered Product gallery',
    JSON.stringify(readProduct?.gallery?.map((media) => media.asset_id)) === JSON.stringify([assetId, secondAssetId]),
    readProduct,
  )
  expectValue('set_media updates explicit Product primary', readProduct?.image?.asset_id === assetId, readProduct)

  const postRead = await mcp(headers, 'get_post', {
    site_id: siteId,
    post_id: postId,
  })
  expectStatus('get_post succeeds', postRead)
  expectValue('set_media updates post cover', data(postRead.body)?.post?.media?.some(media => media.slot === 'cover' && media.asset_id === assetId), data(postRead.body))

  const secondProductRead = await mcp(headers, 'get_product', {
    site_id: siteId,
    product_id: secondProductId,
  })
  expectStatus('get_product (second) succeeds', secondProductRead)
  expectValue('attach_media updates the second Product media', data(secondProductRead.body)?.product?.gallery?.[0]?.asset_id === assetId, data(secondProductRead.body))

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
