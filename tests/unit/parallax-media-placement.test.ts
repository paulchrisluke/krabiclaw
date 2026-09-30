import assert from 'node:assert/strict'
import test from 'node:test'

import { isSingleMediaPlacement, isSupportedMediaPlacement } from '../../shared/media-placement-contract.ts'

const heroSlots = [
  'parallax_sky',
  'parallax_clouds',
  'parallax_mountains',
  'parallax_far_trees',
  'parallax_building_trees',
  'parallax_foreground',
]

const breakpoints = ['xxs', 'xs', 'sm', 'md', 'lg']

test('homepage parallax hero slots are editable single-value content block media placements', () => {
  for (const slot of heroSlots) {
    assert.equal(isSupportedMediaPlacement({ owner_type: 'content_block', slot }), true)
    assert.equal(isSingleMediaPlacement({ owner_type: 'content_block', slot }), true)

    for (const breakpoint of breakpoints) {
      const responsiveSlot = `${slot}_${breakpoint}`
      assert.equal(isSupportedMediaPlacement({ owner_type: 'content_block', slot: responsiveSlot }), true)
      assert.equal(isSingleMediaPlacement({ owner_type: 'content_block', slot: responsiveSlot }), true)
    }
  }
})
