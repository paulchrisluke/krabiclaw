import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../../lib/components/workspace/settings/LocationSettingsPage.vue', import.meta.url),
  'utf8',
)

test('LOCATION_FEATURE_LABELS keys the restaurant menu module by its real ProductFeature id', () => {
  // Regression: the map used 'menu' as a key, but toggleableModulesForScope
  // (config/cms-registry.ts) always emits the canonical id 'products' for
  // this module regardless of vertical — 'menu' is only a display label.
  // locationFeatureLabel('products') threw "Unsupported location feature:
  // products", crashing the Available Features panel for every
  // restaurant-vertical site's location settings.
  assert.match(source, /const LOCATION_FEATURE_LABELS = \{\s*products: 'Menu'/)
})
