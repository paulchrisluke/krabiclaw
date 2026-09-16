import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TENANT_PAGE_BLOCK_REGISTRY, type TenantPageBlockType } from '~/utils/tenant-page-blocks'
import { tenantPageBlockSections, tenantPageBlockFieldsForSection } from '~/utils/tenant-page-block-sections'

/**
 * DESIGN.md measures a leaf by counting: "If a screen needs more than about
 * three controls, it is not a leaf — it is a hub, and its fields belong one
 * level deeper." The editor derives its controls from the block registry now,
 * so a field added to a declaration can silently push a leaf over that line.
 * This counts them, the way DESIGN.md says to.
 */
const LEAF_CONTROL_LIMIT = 3

test('no block leaf exceeds the DESIGN.md control limit', () => {
  const over: string[] = []
  for (const type of Object.keys(TENANT_PAGE_BLOCK_REGISTRY) as TenantPageBlockType[]) {
    const block = { id: 'x', type, position: 0, level: null, data: {}, media: [] } as never
    const sections = tenantPageBlockSections(block)
    // Fields that describe the block render on the block's own screen — which,
    // for a block with a single section, is that section's screen. Count what
    // the screen shows, not what the section declares.
    const blockFields = tenantPageBlockFieldsForSection(block, 'block').length
    for (const section of sections) {
      if (section.kind === 'list') continue
      const shared = sections.length === 1 ? blockFields : 0
      const count = tenantPageBlockFieldsForSection(block, section.key).length + shared
      if (count > LEAF_CONTROL_LIMIT) over.push(`${type}/${section.key} has ${count}`)
    }
  }
  assert.deepEqual(over, [], `leaves over ${LEAF_CONTROL_LIMIT} controls: ${over.join(', ')}`)
})
