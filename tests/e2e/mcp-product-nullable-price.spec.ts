import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { ensureSite, mcpData, mcpRequest } from './helpers/mcp'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

interface ProductRow {
  id: string
  price: null | {
    amount_minor: number
    currency: string
    unit: string
    tax_behavior: string
  }
  details: Array<{ key: string; label: string; values: string[] }>
}

test('deployed MCP transport preserves an explicit no-fixed-price Product', async ({ request, baseURL }) => {
  test.setTimeout(120_000)

  await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
  const toolsResponse = await mcpRequest(request, baseURL!, { method: 'tools/list' })
  expect(await toolsResponse.json()).toMatchObject({
    result: {
      tools: expect.arrayContaining([expect.objectContaining({
        name: 'create_product',
        inputSchema: expect.objectContaining({
          properties: expect.objectContaining({
            price: expect.objectContaining({ required: ['amount_minor'] }),
          }),
        }),
      })]),
    },
  })
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

  const fixedCreate = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'create_product',
    args: {
      site_id: siteId,
      location_id: locationId,
      category: 'Sushi',
      name: 'Salmon Roll',
      price: { amount_minor: 500 },
    },
  })

  expect(fixedCreate.status()).toBe(200)
  const fixed = mcpData<{ product: ProductRow }>(await fixedCreate.json()).product
  expect(fixed.price).toMatchObject({
    amount_minor: 500,
    currency: 'THB',
    unit: 'item',
    tax_behavior: 'unspecified',
  })
})
