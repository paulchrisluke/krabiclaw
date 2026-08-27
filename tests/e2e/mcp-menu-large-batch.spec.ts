import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { ensureSite, mcpData, mcpRequest } from './helpers/mcp'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

test('menu batches atomically reconcile more than 100 items without media', async ({ request, baseURL }) => {
  test.setTimeout(120_000)
  await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
  const siteId = await ensureSite(request, baseURL!)

  const createMenu = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'create_menu',
    args: { site_id: siteId, name: 'Large atomic menu' },
  })
  expect(createMenu.status()).toBe(200)
  const menuId = mcpData<{ id: string }>(await createMenu.json()).id

  const items = Array.from({ length: 130 }, (_, index) => ({
    section: index < 65 ? 'First' : 'Second',
    name: `Batch item ${String(index + 1).padStart(3, '0')}`,
    description: `Original ${index + 1}`,
    price_amount: 100 + index,
  }))

  const invalidItems = items.map((item, index) => index === 129 ? { ...item, sale_starts_at: 'invalid' } : item)
  const invalidAdd = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'add_menu_items_batch',
    args: { site_id: siteId, menu_id: menuId, items: invalidItems },
  })
  expect(invalidAdd.status()).toBe(200)
  expect((await invalidAdd.json()).result?.isError).toBe(true)

  const afterInvalid = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'get_menu',
    args: { site_id: siteId, menu_id: menuId, limit: 100 },
  })
  expect(mcpData<{ menu: { items: unknown[] } }>(await afterInvalid.json()).menu.items).toHaveLength(0)

  const validAdd = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'add_menu_items_batch',
    args: { site_id: siteId, menu_id: menuId, items },
  })
  const added = mcpData<{ added: number; skipped: unknown[] }>(await validAdd.json())
  expect(added).toMatchObject({ added: 130, skipped: [] })

  const firstPageResponse = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'get_menu',
    args: { site_id: siteId, menu_id: menuId, limit: 100 },
  })
  const firstPage = mcpData<{
    menu: { items: Array<{ id: string; available: boolean; description: string | null }> }
    item_page_info: { has_more: boolean; next_cursor: string }
  }>(await firstPageResponse.json())
  expect(firstPage.menu.items).toHaveLength(100)
  expect(firstPage.item_page_info.has_more).toBe(true)

  const secondPageResponse = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'get_menu',
    args: { site_id: siteId, menu_id: menuId, limit: 100, cursor: firstPage.item_page_info.next_cursor },
  })
  const secondPage = mcpData<{
    menu: { items: Array<{ id: string; available: boolean; description: string | null }> }
    item_page_info: { has_more: boolean }
  }>(await secondPageResponse.json())
  expect(secondPage.menu.items).toHaveLength(30)
  expect(secondPage.item_page_info.has_more).toBe(false)

  const allItems = [...firstPage.menu.items, ...secondPage.menu.items]
  const desired = allItems.slice(0, 125).map((item, index) => ({
    item_id: item.id,
    ...(index === 0 ? { description: 'Updated before boundary' } : {}),
    ...(index === 124 ? { description: 'Updated after boundary' } : {}),
  }))
  const syncResponse = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'sync_menu_items',
    args: { site_id: siteId, menu_id: menuId, items: desired, set_missing_unavailable: true },
  })
  const sync = mcpData<{
    summary: { created: number; updated: number; unchanged: number; made_unavailable: number; skipped: number }
  }>(await syncResponse.json())
  expect(sync.summary).toEqual({ created: 0, updated: 2, unchanged: 123, made_unavailable: 5, skipped: 0 })
})
