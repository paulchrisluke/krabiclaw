import assert from 'node:assert/strict'
import test from 'node:test'

import { validateToolAnnotations } from '../../server/utils/mcp-tools/shared.ts'

test('MCP annotation validation accepts only internally consistent hint combinations', () => {
  assert.doesNotThrow(() => validateToolAnnotations(
    'search',
    { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    false,
  ))
  assert.doesNotThrow(() => validateToolAnnotations(
    'publish',
    { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    false,
  ))
  assert.throws(
    () => validateToolAnnotations(
      'bad_read',
      { readOnlyHint: true, openWorldHint: false, destructiveHint: true },
      false,
    ),
    /cannot declare destructiveHint as true/,
  )
  assert.throws(
    () => validateToolAnnotations(
      'bad_read',
      { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      true,
    ),
    /cannot require confirmation/,
  )
})
