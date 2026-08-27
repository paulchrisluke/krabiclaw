import assert from 'node:assert/strict'
import test from 'node:test'

import { paginateMcpCollection } from '../../server/utils/mcp-pagination.ts'

test('MCP pagination defaults to 50 and continues with an opaque cursor', () => {
  const values = Array.from({ length: 105 }, (_, index) => index)
  const first = paginateMcpCollection(values, {}, { resource: 'values' })

  assert.deepEqual(first.items, values.slice(0, 50))
  assert.equal(first.page_info.has_more, true)
  assert.equal(typeof first.page_info.next_cursor, 'string')

  const second = paginateMcpCollection(values, { cursor: first.page_info.next_cursor }, { resource: 'values' })
  assert.deepEqual(second.items, values.slice(50, 100))
  assert.equal(second.page_info.has_more, true)

  const third = paginateMcpCollection(values, { cursor: second.page_info.next_cursor }, { resource: 'values' })
  assert.deepEqual(third.items, values.slice(100))
  assert.deepEqual(third.page_info, { has_more: false, next_cursor: null })
})

test('MCP pagination enforces the 100-item maximum', () => {
  assert.throws(
    () => paginateMcpCollection([], { limit: 101 }, { resource: 'values' }),
    /limit must be an integer between 1 and 100/,
  )
})

test('MCP pagination cursors are resource and revision bound', () => {
  const first = paginateMcpCollection([1, 2], { limit: 1 }, { resource: 'values', revision: 'one' })
  assert.throws(
    () => paginateMcpCollection([1, 2], { cursor: first.page_info.next_cursor }, { resource: 'other', revision: 'one' }),
    /does not belong to this resource/,
  )
  assert.throws(
    () => paginateMcpCollection([1, 2], { cursor: first.page_info.next_cursor }, { resource: 'values', revision: 'two' }),
    /changed between pages/,
  )
})
