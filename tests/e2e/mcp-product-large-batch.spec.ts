import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { ensureLocation, ensureSite, mcpData, mcpRequest } from './helpers/mcp'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

interface CreatedProduct { id: string; name: string; description: string; active: boolean }

test('Product batches validate and commit atomically at the supported limit', async ({ request, baseURL }) => {
  test.setTimeout(120_000)
  await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
  const siteId = await ensureSite(request, baseURL!)
  const locationId = await ensureLocation(request, baseURL!, siteId)

  const collectionIds: string[] = []
  for (const name of ['First', 'Second']) {
    const response = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_collection',
      args: { site_id: siteId, name },
    })
    collectionIds.push(mcpData<{ collection: { id: string } }>(await response.json()).collection.id)
  }

  const products = Array.from({ length: 100 }, (_, index) => ({
    name: `Batch Product ${String(index + 1).padStart(3, '0')}`,
    description: `Original ${index + 1}`,
    variants: [{ name: 'Standard', prices: [{ unit_amount: (100 + index) * 100, currency: 'USD' }] }],
  }))
  // One invalid row anywhere in the batch must take the whole batch down: a
  // partial catalogue is worse than none, because nobody can tell which half
  // landed.
  const invalidProducts = products.map((product, index) => index === 99
    ? { ...product, variants: [{ name: 'Standard', prices: [{ unit_amount: (100 + index) * 100, currency: 'USD', valid_from_at: 'invalid' }] }] }
    : product)

  const invalidCreate = await mcpRequest(request, baseURL!, {
    method: 'tools/call', toolName: 'batch_create_products',
    args: { site_id: siteId, products: invalidProducts },
  })
  expect((await invalidCreate.json()).result?.isError).toBe(true)

  const afterInvalid = await mcpRequest(request, baseURL!, {
    method: 'tools/call', toolName: 'list_products', args: { site_id: siteId, limit: 100 },
  })
  expect(mcpData<{ products: unknown[] }>(await afterInvalid.json()).products).toHaveLength(0)

  const validCreate = await mcpRequest(request, baseURL!, {
    method: 'tools/call', toolName: 'batch_create_products',
    args: { site_id: siteId, products },
  })
  const created = mcpData<{ products: CreatedProduct[] }>(await validCreate.json()).products
  expect(created).toHaveLength(100)

  // Membership is explicit and ordered, and one call sets the whole list.
  for (const [index, collectionId] of collectionIds.entries()) {
    const slice = created.slice(index * 50, index * 50 + 50).map(product => product.id)
    const response = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'set_collection_products',
      args: { site_id: siteId, collection_id: collectionId, product_ids: slice },
    })
    expect(mcpData<{ products: unknown[] }>(await response.json()).products).toHaveLength(50)
  }
  await mcpRequest(request, baseURL!, {
    method: 'tools/call', toolName: 'set_product_location',
    args: { site_id: siteId, product_id: created[0]!.id, location_id: locationId, active: true, published: true },
  })

  const desired = created.slice(0, 95).map((product, index) => ({
    product_id: product.id,
    name: `Batch Product ${String(index + 1).padStart(3, '0')}`,
    description: index === 0 ? 'Updated atomically' : `Original ${index + 1}`,
    variants: [{ name: 'Standard', prices: [{ unit_amount: (100 + index) * 100, currency: 'USD' }] }],
  }))
  const reconcileResponse = await mcpRequest(request, baseURL!, {
    method: 'tools/call', toolName: 'reconcile_products',
    args: { site_id: siteId, products: desired, deactivate_missing: true },
  })
  const reconciled = mcpData<{ products: CreatedProduct[] }>(await reconcileResponse.json()).products
  expect(reconciled).toHaveLength(100)
  expect(reconciled.find(product => product.id === created[0]!.id)?.description).toBe('Updated atomically')
  // Omitted Products have their sale switch turned off; nothing is deleted and
  // nothing claims they are sold out.
  expect(reconciled.filter(product => !product.active)).toHaveLength(5)
})
