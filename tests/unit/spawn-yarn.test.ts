import assert from 'node:assert/strict'
import test from 'node:test'

import { spawnYarn } from '../../scripts/utils/spawn-yarn.mjs'

test('spawnYarn launches a local package binary', () => {
  const result = spawnYarn(['wrangler', '--version'])

  assert.equal(result.error, undefined)
  assert.equal(result.status, 0)
})
