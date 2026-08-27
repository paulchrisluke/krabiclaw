import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { isSingleMediaPlacement } from '../../shared/media-placement-contract.ts'

test('content block scalar media slots remain replaceable', () => {
  for (const slot of ['media', 'featured', 'background', 'decoration']) {
    assert.equal(isSingleMediaPlacement({ owner_type: 'content_block', slot }), true, slot)
  }
  assert.equal(isSingleMediaPlacement({ owner_type: 'content_block', slot: 'gallery' }), false)
})

test('tenant and platform block updates distinguish scalar slots from galleries', () => {
  for (const path of ['../../server/utils/tenant-pages.ts', '../../server/utils/platform-content.ts']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.match(source, /isSingleMediaPlacement\(\{ owner_type: 'content_block', slot \}\)/)
    assert.match(source, /buildSingleMediaPlacementQueries\(\{/)
    assert.match(source, /cannot replace an existing gallery/)
  }
})
