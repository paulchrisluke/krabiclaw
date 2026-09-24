import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { MCP_GROWTH_ORGANIZATION_ID, mcpData, mcpRequest } from './helpers/mcp'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

interface CreatedProduct { id: string; name: string; description: string; active: boolean }

test('Product batches validate and commit atomically at the supported limit', async ({ request, baseURL }) => {
  test.setTimeout(120_000)
  await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
  const organizationId = MCP_GROWTH_ORGANIZATION_ID
  const locationId = 'loc-demo'

  // The demo's own catalog is part of the tenant this runs on. Its active
  // products are read first so every assertion below names exactly which
  // products an operation touched.
  const listProducts = async () => {
    const products: CreatedProduct[] = []
    let cursor: string | undefined
    do {
      const page = mcpData<{ products: CreatedProduct[]; next_cursor?: string | null }>(await (await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'list_products', args: { organization_id: organizationId, limit: 100, ...(cursor ? { cursor } : {}) },
      })).json())
      products.push(...page.products)
      cursor = page.next_cursor ?? undefined
    } while (cursor)
    return products
  }
  const demoActiveIds = (await listProducts()).filter(product => product.active).map(product => product.id).sort()
  expect(demoActiveIds.length, 'the demo tenant sells products').toBeGreaterThan(0)

  const collectionIds: string[] = []
  let created: CreatedProduct[] = []
  try {
    for (const name of ['First', 'Second']) {
      const response = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'create_collection',
        args: { organization_id: organizationId, name },
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
      args: { organization_id: organizationId, products: invalidProducts },
    })
    expect((await invalidCreate.json()).result?.isError).toBe(true)

    // Nothing from the refused batch landed, and the demo's catalog is untouched.
    const afterInvalid = await listProducts()
    expect(afterInvalid.filter(product => product.name.startsWith('Batch Product '))).toEqual([])
    expect(afterInvalid.filter(product => product.active).map(product => product.id).sort()).toEqual(demoActiveIds)

    const validCreate = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'batch_create_products',
      args: { organization_id: organizationId, products },
    })
    created = mcpData<{ products: CreatedProduct[] }>(await validCreate.json()).products
    expect(created).toHaveLength(100)

    // Membership is explicit and ordered, and one call sets the whole list.
    for (const [index, collectionId] of collectionIds.entries()) {
      const slice = created.slice(index * 50, index * 50 + 50).map(product => product.id)
      const response = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'set_collection_products',
        args: { organization_id: organizationId, collection_id: collectionId, product_ids: slice },
      })
      expect(mcpData<{ products: unknown[] }>(await response.json()).products).toHaveLength(50)
    }
    await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'set_product_location',
      args: { organization_id: organizationId, product_id: created[0]!.id, location_id: locationId, active: true, published: true },
    })

    const desired = created.slice(0, 95).map((product, index) => ({
      product_id: product.id,
      name: `Batch Product ${String(index + 1).padStart(3, '0')}`,
      description: index === 0 ? 'Updated atomically' : `Original ${index + 1}`,
      variants: [{ name: 'Standard', prices: [{ unit_amount: (100 + index) * 100, currency: 'USD' }] }],
    }))
    const reconcileResponse = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'reconcile_products',
      args: { organization_id: organizationId, products: desired, deactivate_missing: true },
    })
    const reconciled = mcpData<{ products: CreatedProduct[] }>(await reconcileResponse.json()).products
    expect(reconciled.find(product => product.id === created[0]!.id)?.description).toBe('Updated atomically')
    // deactivate_missing covers the whole tenant: every active product the
    // request omitted has its sale switch turned off — the five batch products
    // left out and every product the demo already sold. Nothing is deleted and
    // nothing claims to be sold out.
    const omitted = [...created.slice(95).map(product => product.id), ...demoActiveIds].sort()
    expect(reconciled.filter(product => !product.active).map(product => product.id).sort()).toEqual(omitted)
    expect(reconciled.filter(product => product.active).map(product => product.id).sort())
      .toEqual(created.slice(0, 95).map(product => product.id).sort())
  } finally {
    // Put the demo back the way the CMS would: its own partial update flips
    // the sale switch and restates nothing else.
    for (const productId of demoActiveIds) {
      const restore = await request.patch(`${baseURL}/api/editor/organizations/${organizationId}/products/${productId}`, { data: { active: true } })
      expect(restore.status(), await restore.text()).toBe(200)
    }
    for (const product of created) {
      const removed = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'delete_product', args: { organization_id: organizationId, product_id: product.id } })
      expect(mcpData<{ deleted: boolean }>(await removed.json()).deleted).toBe(true)
    }
    for (const collectionId of collectionIds) {
      const removed = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'delete_collection', args: { organization_id: organizationId, collection_id: collectionId } })
      expect(mcpData<{ deleted: boolean }>(await removed.json()).deleted).toBe(true)
    }
  }
  const restored = await listProducts()
  expect(restored.filter(product => product.active).map(product => product.id).sort()).toEqual(demoActiveIds)
  expect(restored.filter(product => product.name.startsWith('Batch Product '))).toEqual([])
})
