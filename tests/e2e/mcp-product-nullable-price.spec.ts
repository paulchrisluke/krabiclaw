import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { ensureSite, mcpData, mcpRequest } from './helpers/mcp'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

interface ProductRow {
  id: string
  price: null
  details: Array<{ key: string; label: string; values: string[] }>
}

test('deployed MCP transport preserves an explicit no-fixed-price Product', async ({ request, baseURL }) => {
  await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
  const siteId = await ensureSite(request, baseURL!)
  const locationResponse = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'create_location',
    args: { site_id: siteId, title: `Nullable Price ${Date.now()}` },
  })
  const locationId = mcpData<{ id: string }>(await locationResponse.json()).id

  const create = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'create_product',
    args: {
      site_id: siteId,
      location_id: locationId,
      category: 'Sushi',
      name: 'Chef\'s Choice',
      price: null,
      details: [{ key: 'price-note', label: 'Price', values: ['Market Price'] }],
    },
  })

  expect(create.status()).toBe(200)
  const created = mcpData<{ product: ProductRow }>(await create.json()).product
  expect(created.price).toBeNull()
  expect(created.details).toEqual([{ key: 'price-note', label: 'Price', values: ['Market Price'] }])
})
