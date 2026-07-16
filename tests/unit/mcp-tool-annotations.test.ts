import test from 'node:test'
import assert from 'node:assert/strict'

import { BOUNDED_WRITE_TOOL_NAMES, READ_ONLY_TOOL_NAMES } from '../../server/utils/mcp-tools/shared.ts'

test('document analysis is classified as a credit-charging bounded write', () => {
  assert.equal(READ_ONLY_TOOL_NAMES.includes('analyze_document' as never), false)
  assert.equal(BOUNDED_WRITE_TOOL_NAMES.includes('analyze_document'), true)
})
