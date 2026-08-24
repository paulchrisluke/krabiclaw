import test from 'node:test'
import assert from 'node:assert/strict'

import {
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
