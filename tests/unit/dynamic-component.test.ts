import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveDynamicComponent } from '../../composables/useDynamicComponent.ts'

test('resolveDynamicComponent returns only registered components', () => {
  assert.equal(resolveDynamicComponent('SayaHero'), 'SayaHero')
  assert.throws(
    () => resolveDynamicComponent('SayaContentBlockFallback'),
    /component is not registered/,
  )
})
