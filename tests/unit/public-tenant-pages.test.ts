import assert from 'node:assert/strict'
import test from 'node:test'
import { selectPublicTenantPageBlocks } from '../../server/utils/public-tenant-pages.ts'

test('public tenant pages omit non-visual legacy legal metadata', () => {
  const blocks = [
    { id: 'hero', type: 'hero' as const, position: 0, data: { title: 'Privacy Policy' } },
    { id: 'meta', type: 'callout' as const, position: 1, data: { type: 'legal_meta', updated_at: null } },
    { id: 'divider', type: 'divider' as const, position: 2, data: { section: 'shield-divider' } },
  ]

  assert.deepEqual(selectPublicTenantPageBlocks(blocks), [blocks[0], blocks[2]])
})
