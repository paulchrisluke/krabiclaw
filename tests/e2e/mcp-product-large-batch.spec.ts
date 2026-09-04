import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { ensureSite, mcpData, mcpRequest } from './helpers/mcp'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

test('Product batches validate and commit atomically at the supported limit', async ({ request, baseURL }) => {
  test.setTimeout(120_000)
  await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
  const siteId = await ensureSite(request, baseURL!)
  const locationResponse = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'create_location',
    args: { site_id: siteId, title: `Product Batch ${Date.now()}` },
  })
  const locationId = mcpData<{ id: string }>(await locationResponse.json()).id

  const categoryIds: string[] = []
  for (const name of ['First', 'Second']) {
    const response = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_product_category',
      args: { site_id: siteId, location_id: locationId, name },
    })
    categoryIds.push(mcpData<{ category: { id: string } }>(await response.json()).category.id)
  }

  const products = Array.from({ length: 100 }, (_, index) => ({
    category_id: index < 50 ? categoryIds[0]! : categoryIds[1]!,
    name: `Batch Product ${String(index + 1).padStart(3, '0')}`,
    description: `Original ${index + 1}`,
    price: { amount_minor: (100 + index) * 100, currency: 'USD', unit: 'item', tax_behavior: 'unspecified' },
  }))
  const invalidProducts = products.map((product, index) => index === 99 ? { ...product, price: { ...product.price, valid_from: 'invalid' } } : product)

  const invalidCreate = await mcpRequest(request, baseURL!, {
    method: 'tools/call', toolName: 'batch_create_products',
    args: { site_id: siteId, location_id: locationId, products: invalidProducts },
  })
  expect((await invalidCreate.json()).result?.isError).toBe(true)

  const afterInvalid = await mcpRequest(request, baseURL!, {
    method: 'tools/call', toolName: 'list_location_products',
    args: { site_id: siteId, location_id: locationId, limit: 100 },
  })
  expect(mcpData<{ products: unknown[] }>(await afterInvalid.json()).products).toHaveLength(0)

  const validCreate = await mcpRequest(request, baseURL!, {
    method: 'tools/call', toolName: 'batch_create_products',
    args: { site_id: siteId, location_id: locationId, products },
  })
  expect(mcpData<{ products: unknown[] }>(await validCreate.json()).products).toHaveLength(100)

  const created = mcpData<{ products: Array<{ id: string }> }>(await validCreate.json()).products
  const desired = created.slice(0, 95).map((product, index) => ({
    product_id: product.id,
    category_id: index < 50 ? categoryIds[0]! : categoryIds[1]!,
    name: `Batch Product ${String(index + 1).padStart(3, '0')}`,
    description: index === 0 ? 'Updated atomically' : `Original ${index + 1}`,
    price: { amount_minor: (100 + index) * 100, currency: 'USD', unit: 'item', tax_behavior: 'unspecified' },
  }))
  const syncResponse = await mcpRequest(request, baseURL!, {
    method: 'tools/call', toolName: 'sync_products',
    args: { site_id: siteId, location_id: locationId, products: desired, set_missing_unavailable: true },
  })
  const synced = mcpData<{ products: Array<{ id: string; available: boolean; description: string }> }>(await syncResponse.json()).products
  expect(synced).toHaveLength(100)
  expect(synced.find(product => product.id === created[0]!.id)?.description).toBe('Updated atomically')
  expect(synced.filter(product => !product.available)).toHaveLength(5)
})
