import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { MENUS_TOOLS } from '../../server/utils/mcp-tools/menus.ts'
import { MAX_MENU_BATCH_ITEMS } from '../../server/utils/menu-batch-limits.ts'

function tool(name: string) {
  const definition = MENUS_TOOLS.find(candidate => candidate.name === name)
  assert.ok(definition, `${name} must exist`)
  return definition
}

test('menu batch tools accept one atomic request beyond 100 items', () => {
  for (const name of ['add_menu_items_batch', 'sync_menu_items']) {
    const definition = tool(name)
    const items = (definition.inputSchema.properties as Record<string, Record<string, unknown>>).items
    assert.equal(items.minItems, 1)
    assert.equal(items.maxItems, MAX_MENU_BATCH_ITEMS)
    assert.ok(Number(items.maxItems) > 100)
  }
})

test('menu tools require complete pagination followed by one atomic mutation', () => {
  const getMenu = tool('get_menu')
  const add = tool('add_menu_items_batch')
  const sync = tool('sync_menu_items')
  const syncProperties = sync.inputSchema.properties as Record<string, Record<string, unknown>>

  assert.match(getMenu.description, /next_cursor/)
  assert.match(getMenu.description, /has_more is false/)
  assert.match(add.description, /atomically/i)
  assert.match(sync.description, /complete intended mutation in one call/)
  assert.match(sync.description, /rolls back together/)
  assert.match(String(syncProperties.set_missing_unavailable?.description), new RegExp(String(MAX_MENU_BATCH_ITEMS)))
})

test('menu batch executors commit through one D1 batch and never truncate input', () => {
  const source = readFileSync(new URL('../../server/utils/mcp-executor/menus.ts', import.meta.url), 'utf8')
  const add = source.slice(source.indexOf('case "add_menu_items_batch"'), source.indexOf('case "sync_menu_items"'))
  const sync = source.slice(source.indexOf('case "sync_menu_items"'), source.indexOf('default:'))

  for (const segment of [add, sync]) {
    assert.equal((segment.match(/\bawait executeBatch\(/g) ?? []).length, 1)
    assert.doesNotMatch(segment, /\.slice\(0,\s*\d+\)/)
  }
  assert.match(source, /function chunkMenuItemMediaPlacements[\s\S]*MAX_D1_JSON_BIND_BYTES/)
  assert.match(source, /function createMenuItemMediaBatchQueries[\s\S]*FROM json_each\(\?\)/)
  assert.match(add, /const distinctMedia = \[\.\.\.new Map\(/)
  assert.match(sync, /UPDATE menus SET section_order = \?, updated_at = \?, updated_by = \? WHERE id = \? AND organization_id = \? AND site_id = \?/)
})
