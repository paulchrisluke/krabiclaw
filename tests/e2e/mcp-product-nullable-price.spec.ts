import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { ensureSite, MCP_GROWTH_SITE_ID, mcpData, mcpRequest } from './helpers/mcp'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

interface PriceRow { id: string; amount_minor: number; currency: string; valid_from: string; valid_until: string | null }
interface ProductRow { id: string; price: PriceRow | null; details: Array<{ key: string; label: string; values: string[] }> }

test.describe('nullable Product price (issue #738)', () => {
  test('create_product accepts price: null and creates no Price row', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = await ensureSite(request, baseURL!)
    const locationResponse = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_location',
      args: { site_id: siteId, title: `Nullable Price ${Date.now()}` },
    })
    const locationId = mcpData<{ id: string }>(await locationResponse.json()).id

    const create = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_product',
      args: {
        site_id: siteId, location_id: locationId,
        category: 'Sushi', name: 'Chef\'s Choice',
        price: null,
        details: [{ key: 'price-note', label: 'Price', values: ['Market Price'] }],
      },
    })
    expect(create.status()).toBe(200)
    const created = mcpData<{ product: ProductRow }>(await create.json()).product
    expect(created.price).toBeNull()
    expect(created.details).toEqual([{ key: 'price-note', label: 'Price', values: ['Market Price'] }])

    const fetched = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'get_product',
      args: { site_id: siteId, product_id: created.id },
    })
    const refetched = mcpData<{ product: ProductRow }>(await fetched.json()).product
    expect(refetched.price).toBeNull()

    // A missing `price` key must still be rejected — required, nullable, never optional.
    const missingPrice = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_product',
      args: { site_id: siteId, location_id: locationId, category: 'Sushi', name: 'No Price Key' },
    })
    expect((await missingPrice.json()).result?.isError).toBe(true)
  })

  test('batch_create_products commits a mixed fixed/null batch atomically and rolls back an invalid one', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = await ensureSite(request, baseURL!)
    const locationResponse = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_location',
      args: { site_id: siteId, title: `Nullable Batch ${Date.now()}` },
    })
    const locationId = mcpData<{ id: string }>(await locationResponse.json()).id

    const invalidBatch = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'batch_create_products',
      args: {
        site_id: siteId, location_id: locationId,
        products: [
          { category: 'Sushi', name: 'Fixed One', price: { amount_minor: 50000, currency: 'USD' } },
          { category: 'Sushi', name: 'Broken One', price: { amount_minor: -1, currency: 'USD' } },
        ],
      },
    })
    expect((await invalidBatch.json()).result?.isError).toBe(true)

    const afterInvalid = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'list_location_products',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(mcpData<{ products: unknown[] }>(await afterInvalid.json()).products).toHaveLength(0)

    const validBatch = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'batch_create_products',
      args: {
        site_id: siteId, location_id: locationId,
        products: [
          { category: 'Sushi', name: 'Fixed Roll', price: { amount_minor: 50000, currency: 'USD' } },
          { category: 'Sushi', name: 'Market Price Roll', price: null },
        ],
      },
    })
    expect(validBatch.status()).toBe(200)
    const products = mcpData<{ products: ProductRow[] }>(await validBatch.json()).products
    expect(products).toHaveLength(2)
    const fixed = products.find(p => p.price !== null)
    const nullPriced = products.find(p => p.price === null)
    expect(fixed?.price?.amount_minor).toBe(50000)
    expect(nullPriced).toBeTruthy()
  })

  test('sync_products closes an active Price with a future valid_until when synced to null, and null→fixed creates exactly one active Price', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = await ensureSite(request, baseURL!)
    const locationResponse = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_location',
      args: { site_id: siteId, title: `Nullable Sync ${Date.now()}` },
    })
    const locationId = mcpData<{ id: string }>(await locationResponse.json()).id

    // Active Price with a scheduled future end date — this is the exact shape
    // that exposed the closeActivePriceQuery bug (it only matched
    // valid_until IS NULL, so a Price with a future valid_until was silently
    // never closed by a sync to price: null).
    const futureValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const create = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_product',
      args: {
        site_id: siteId, location_id: locationId, category: 'Sushi', name: 'Scheduled End Roll',
        price: { amount_minor: 60000, currency: 'USD', valid_until: futureValidUntil },
      },
    })
    const productId = mcpData<{ product: ProductRow }>(await create.json()).product.id

    const syncToNull = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'sync_products',
      args: {
        site_id: siteId, location_id: locationId,
        products: [{ product_id: productId, category: 'Sushi', name: 'Scheduled End Roll', price: null }],
      },
    })
    expect(syncToNull.status()).toBe(200)
    const afterNullSync = mcpData<{ products: ProductRow[] }>(await syncToNull.json()).products
    const nullSynced = afterNullSync.find(p => p.id === productId)
    expect(nullSynced?.price).toBeNull()

    const syncToFixed = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'sync_products',
      args: {
        site_id: siteId, location_id: locationId,
        products: [{ product_id: productId, category: 'Sushi', name: 'Scheduled End Roll', price: { amount_minor: 70000, currency: 'USD' } }],
      },
    })
    expect(syncToFixed.status()).toBe(200)
    const afterFixedSync = mcpData<{ products: ProductRow[] }>(await syncToFixed.json()).products
    const fixedSynced = afterFixedSync.find(p => p.id === productId)
    expect(fixedSynced?.price?.amount_minor).toBe(70000)

    const reread = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'get_product',
      args: { site_id: siteId, product_id: productId },
    })
    expect(mcpData<{ product: ProductRow }>(await reread.json()).product.price?.amount_minor).toBe(70000)
  })

  test('update_product distinguishes omitted price (unchanged) from price: null (closes without replacement)', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = await ensureSite(request, baseURL!)
    const locationResponse = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_location',
      args: { site_id: siteId, title: `Nullable Update ${Date.now()}` },
    })
    const locationId = mcpData<{ id: string }>(await locationResponse.json()).id

    const create = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_product',
      args: { site_id: siteId, location_id: locationId, category: 'Sushi', name: 'Update Roll', price: { amount_minor: 45000, currency: 'USD' } },
    })
    const productId = mcpData<{ product: ProductRow }>(await create.json()).product.id

    const omittedUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'update_product',
      args: { site_id: siteId, product_id: productId, description: 'Still the same price' },
    })
    expect(mcpData<{ product: ProductRow }>(await omittedUpdate.json()).product.price?.amount_minor).toBe(45000)

    const nullUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'update_product',
      args: { site_id: siteId, product_id: productId, price: null },
    })
    expect(mcpData<{ product: ProductRow }>(await nullUpdate.json()).product.price).toBeNull()
  })

  test('the public product API reflects price: null and the preserved price-note detail', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    // The public API requires a launched site (status/onboarding_status
    // 'active') and a location whose CMS feature overrides enable the
    // products manager — ensureSite()'s fresh draft site and a freshly
    // created location satisfy neither, so this uses the pre-launched
    // fixture site's existing primary location instead, same pattern as the
    // public-booking check in mcp-owner-tools.spec.ts.
    const siteId = MCP_GROWTH_SITE_ID
    const locationRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'list_locations',
      args: { site_id: siteId },
    })
    const primaryLocation = mcpData<{ locations: Array<{ id: string; slug: string }> }>(await locationRead.json()).locations[0]!
    const locationId = primaryLocation.id
    const locationSlug = primaryLocation.slug

    const create = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_product',
      args: {
        site_id: siteId, location_id: locationId, category: 'Sushi', name: 'Public Market Roll',
        price: null, is_visible: true,
        details: [{ key: 'price-note', label: 'Price', values: ['Ask Staff'] }],
      },
    })
    const created = mcpData<{ product: ProductRow & { slug: string } }>(await create.json()).product

    const publicRead = await request.get(`${baseURL}/api/public/sites/${siteId}/locations/${locationSlug}/products/${created.slug}`)
    expect(publicRead.status()).toBe(200)
    const publicBody = await publicRead.json() as { product: ProductRow }
    expect(publicBody.product.price).toBeNull()
    expect(publicBody.product.details).toEqual([{ key: 'price-note', label: 'Price', values: ['Ask Staff'] }])
  })
})
