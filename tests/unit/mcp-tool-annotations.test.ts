import assert from 'node:assert/strict'
import test from 'node:test'

import { validateToolAnnotations } from '../../server/utils/mcp-tools/shared.ts'

// validateToolAnnotations (server/utils/mcp-tools/shared.ts) is the single
// canonical guard for MCP tool annotation completeness and correctness. It's
// exported specifically so these combinations can be tested directly, since
// withToolAnnotations itself only accepts a tool name looked up from the
// fixed classification map, not arbitrary hints.
test('validateToolAnnotations accepts a read-only, open-world tool (e.g. a web search)', () => {
  assert.doesNotThrow(() => validateToolAnnotations('search', { readOnlyHint: true, openWorldHint: true, destructiveHint: false }, false))
})

test('validateToolAnnotations accepts a read-only, closed-world tool', () => {
  assert.doesNotThrow(() => validateToolAnnotations('get_thing', { readOnlyHint: true, openWorldHint: false, destructiveHint: false }, false))
})

test('validateToolAnnotations accepts additive and destructive write tools, open- or closed-world', () => {
  assert.doesNotThrow(() => validateToolAnnotations('create_thing', { readOnlyHint: false, openWorldHint: false, destructiveHint: false }, false))
  assert.doesNotThrow(() => validateToolAnnotations('delete_thing', { readOnlyHint: false, openWorldHint: false, destructiveHint: true }, false))
  assert.doesNotThrow(() => validateToolAnnotations('publish_thing', { readOnlyHint: false, openWorldHint: true, destructiveHint: false }, false))
  assert.doesNotThrow(() => validateToolAnnotations('delete_public_thing', { readOnlyHint: false, openWorldHint: true, destructiveHint: true }, false))
})

test('validateToolAnnotations rejects a read-only tool that declares destructiveHint true', () => {
  assert.throws(
    () => validateToolAnnotations('bad_tool', { readOnlyHint: true, openWorldHint: false, destructiveHint: true }, false),
    /cannot declare destructiveHint as true/,
  )
})

test('validateToolAnnotations rejects a read-only tool that requires confirmation', () => {
  assert.throws(
    () => validateToolAnnotations('bad_tool', { readOnlyHint: true, openWorldHint: false, destructiveHint: false }, true),
    /cannot require confirmation/,
  )
})

test('validateToolAnnotations rejects missing openWorldHint or destructiveHint', () => {
  assert.throws(
    () => validateToolAnnotations('bad_tool', { readOnlyHint: false } as never, false),
    /must declare openWorldHint and destructiveHint explicitly/,
  )
})

// No other test in this repo imports the MCP tool catalog, so without this
// test the real per-tool classifications (built from the actual tool list)
// would only ever be checked at server boot, not in the fast unit-test loop.
test('the MCP tool catalog loads without an annotation classification error', async () => {
  await import('../../server/utils/mcp-tools/index.ts')
})
