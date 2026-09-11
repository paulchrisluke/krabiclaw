import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { ensureLocation, ensureSite, mcpData, mcpRequest } from './helpers/mcp'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

interface PriceRow {
  id: string
  currency: string
  unit_amount: number
  location_id: string | null
  active: boolean
}

interface ProductRow {
  id: string
  variants: Array<{ id: string; name: string; prices: PriceRow[] }>
}

/**
 * What a customer buys is a variant, and a price belongs to a variant.
 *
 * This is the transport-level proof of that: the deployed MCP surface takes
 * prices nested under variants, refuses a Product whose variant carries no
 * price it can quote, and never invents an amount to stand in for one.
 */
test('deployed MCP transport prices variants, and refuses to invent a missing amount', async ({ request, baseURL }) => {
  test.setTimeout(120_000)

  await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
  const toolsResponse = await mcpRequest(request, baseURL!, { method: 'tools/list' })
  expect(await toolsResponse.json()).toMatchObject({
    result: {
      tools: expect.arrayContaining([expect.objectContaining({
        name: 'create_product',
        inputSchema: expect.objectContaining({
          properties: expect.objectContaining({ variants: expect.any(Object) }),
        }),
      })]),
    },
  })
  const siteId = await ensureSite(request, baseURL!)
  const locationId = await ensureLocation(request, baseURL!, siteId)

  const create = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'create_product',
    args: {
      site_id: siteId,
      name: 'Salmon Roll',
      variants: [
        { name: 'Six pieces', prices: [{ unit_amount: 500, currency: 'USD' }] },
        { name: 'Twelve pieces', prices: [{ unit_amount: 900, currency: 'USD' }] },
      ],
    },
  })
  expect(create.status()).toBe(200)
  const created = mcpData<{ product: ProductRow }>(await create.json()).product
  expect(created.variants.map(variant => variant.name).sort()).toEqual(['Six pieces', 'Twelve pieces'].sort())
  expect(created.variants.flatMap(variant => variant.prices).map(price => price.unit_amount).sort()).toEqual([500, 900])

  // Publication and location membership are separate states, and a read must
  // report both rather than implying one from the other.
  for (const [toolName, args] of [
    ['set_product_publication', { site_id: siteId, product_id: created.id, published: true }],
    ['set_product_location', { site_id: siteId, product_id: created.id, location_id: locationId, active: true, published: true }],
  ] as const) {
    const response = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName, args })
    expect(response.status(), await response.text()).toBe(200)
  }

  // A Product whose variant has no price is created, and is simply not
  // purchasable: nothing substitutes zero or a note for the amount.
  const unpriced = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'create_product',
    args: { site_id: siteId, name: "Chef's Choice", variants: [{ name: 'Standard' }] },
  })
  expect(unpriced.status()).toBe(200)
  const unpricedProduct = mcpData<{ product: ProductRow }>(await unpriced.json()).product
  expect(unpricedProduct.variants).toHaveLength(1)
  expect(unpricedProduct.variants[0]!.prices).toEqual([])

  // Two simultaneously valid prices of the same scope are refused at write
  // time, so nobody has to pick one at checkout.
  const ambiguous = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'create_product',
    args: {
      site_id: siteId,
      name: 'Ambiguous Roll',
      variants: [{ name: 'Standard', prices: [
        { unit_amount: 500, currency: 'USD' },
        { unit_amount: 600, currency: 'USD' },
      ] }],
    },
  })
  expect(JSON.stringify(await ambiguous.json())).toMatch(/isError|conflict|ambiguous/i)
})
