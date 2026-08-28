import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDeleteOwnerPlacementsQuery } from '../../server/utils/media-asset-manager.ts'
import { preserveOmittedBlockMedia } from '../../server/utils/tenant-pages.ts'
import type { TenantPageBlock } from '../../utils/tenant-page-blocks.ts'

// Regression coverage for the media_placements orphan-cleanup fix: post,
// Product, experience, and owner-entered review deletion all route through
// this one builder, so verifying its query shape verifies all four callers.
test('buildDeleteOwnerPlacementsQuery scopes strictly by owner_type and owner_id', () => {
  const query = buildDeleteOwnerPlacementsQuery({ ownerType: 'post', ownerId: 'post-1' })
  assert.equal(query.query, 'DELETE FROM media_placements WHERE owner_type = ? AND owner_id = ?')
  assert.deepEqual(query.params, ['post', 'post-1'])
})

test('buildDeleteOwnerPlacementsQuery adds organization/site scoping only when provided', () => {
  const query = buildDeleteOwnerPlacementsQuery({
    ownerType: 'review',
    ownerId: 'review-1',
    organizationId: 'org-1',
    siteId: 'site-1',
  })
  assert.equal(
    query.query,
    'DELETE FROM media_placements WHERE owner_type = ? AND organization_id = ? AND site_id = ? AND owner_id = ?',
  )
  assert.deepEqual(query.params, ['review', 'org-1', 'site-1', 'review-1'])
})

// Regression coverage for the tenant-page block-media preservation boundary
// the audit confirmed is already correct: a text-only update (a block payload
// with no `media` key at all) must keep that block's existing media, while an
// explicit `media: []` (the key present, deliberately empty) must clear it.
test('preserveOmittedBlockMedia restores existing media only when the key is entirely absent', () => {
  const existingBlocks: TenantPageBlock[] = [
    {
      id: 'hero-1',
      type: 'hero',
      position: 0,
      data: {},
      media: [{ asset_id: 'asset-1', slot: 'media', sort_order: 0 }],
    },
  ]

  const textOnlyUpdate = preserveOmittedBlockMedia(
    [{ id: 'hero-1', type: 'hero', data: { alt: 'Updated copy' } }],
    existingBlocks,
  )
  assert.deepEqual(textOnlyUpdate, [
    { id: 'hero-1', type: 'hero', data: { alt: 'Updated copy' }, media: [{ asset_id: 'asset-1', slot: 'media', sort_order: 0 }] },
  ])

  const explicitClear = preserveOmittedBlockMedia(
    [{ id: 'hero-1', type: 'hero', data: { alt: 'Updated copy' }, media: [] }],
    existingBlocks,
  )
  assert.deepEqual(explicitClear, [
    { id: 'hero-1', type: 'hero', data: { alt: 'Updated copy' }, media: [] },
  ])
})

test('preserveOmittedBlockMedia leaves a new block (no matching existing id) untouched', () => {
  const result = preserveOmittedBlockMedia(
    [{ id: 'new-block', type: 'markdown', data: { markdown: 'Hello' } }],
    [],
  )
  assert.deepEqual(result, [{ id: 'new-block', type: 'markdown', data: { markdown: 'Hello' } }])
})
