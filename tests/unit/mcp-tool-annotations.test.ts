import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BOUNDED_DESTRUCTIVE_TOOL_NAMES,
  BOUNDED_WRITE_TOOL_NAMES,
  OPEN_WORLD_DESTRUCTIVE_TOOL_NAMES,
  OPEN_WORLD_WRITE_TOOL_NAMES,
  READ_ONLY_TOOL_NAMES,
  TOOL_ANNOTATIONS_BY_NAME,
} from '../../server/utils/mcp-tools/shared.ts'

test('document analysis is classified as a credit-charging bounded write', () => {
  assert.equal(READ_ONLY_TOOL_NAMES.includes('analyze_document' as never), false)
  assert.equal(BOUNDED_WRITE_TOOL_NAMES.includes('analyze_document'), true)
})

test('tool annotations describe reads, public writes, and destructive public writes', () => {
  for (const name of READ_ONLY_TOOL_NAMES) {
    assert.deepEqual(TOOL_ANNOTATIONS_BY_NAME.get(name), { readOnlyHint: true, idempotentHint: true }, name)
  }

  for (const name of OPEN_WORLD_WRITE_TOOL_NAMES) {
    assert.deepEqual(TOOL_ANNOTATIONS_BY_NAME.get(name), {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    }, name)
  }

  for (const name of OPEN_WORLD_DESTRUCTIVE_TOOL_NAMES) {
    assert.deepEqual(TOOL_ANNOTATIONS_BY_NAME.get(name), {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    }, name)
  }
})

test('complete-state replacement tools are destructive open-world writes', () => {
  for (const name of ['set_media', 'sync_menu_items'] as const) {
    assert.equal(OPEN_WORLD_WRITE_TOOL_NAMES.includes(name as never), false, name)
    assert.equal(OPEN_WORLD_DESTRUCTIVE_TOOL_NAMES.includes(name), true, name)
    assert.deepEqual(TOOL_ANNOTATIONS_BY_NAME.get(name), {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    })
  }
})

test('site creation, menu import, and media deletion expose their public impact', () => {
  for (const name of ['create_site', 'import_menu_from_media'] as const) {
    assert.equal(BOUNDED_WRITE_TOOL_NAMES.includes(name as never), false, name)
    assert.equal(OPEN_WORLD_WRITE_TOOL_NAMES.includes(name), true, name)
    assert.deepEqual(TOOL_ANNOTATIONS_BY_NAME.get(name), {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    })
  }

  assert.equal(BOUNDED_DESTRUCTIVE_TOOL_NAMES.includes('delete_media_asset' as never), false)
  assert.equal(OPEN_WORLD_DESTRUCTIVE_TOOL_NAMES.includes('delete_media_asset'), true)
  assert.deepEqual(TOOL_ANNOTATIONS_BY_NAME.get('delete_media_asset'), {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
  })
})
