import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Regression test for the double-charge bug fixed in #277: OnboardingWizard's
// add-location mode calls POST /api/dashboard/locations/add twice for one
// logical "add this location" operation — once with previewOnly:true (the
// confirm card), once without it to actually create the location. Before the
// fix, the google_places_details chargeFlatCredits() call sat *before* the
// `if (previewOnly) return ...` branch, so every preview click and every
// creation click both charged, double-billing ai_credits for a single
// add-location flow.
//
// server/api/dashboard/locations/add.post.ts can't be imported directly under
// plain node (it relies on Nitro's defineEventHandler/readBody auto-imports,
// same as every other server/api/* route in this repo — see the absence of
// any existing tests/unit/*.test.ts importing a server/api/**/*.post.ts file
// directly). This test instead asserts the fix structurally: the
// google_places_details charge call must appear strictly after the
// `if (previewOnly)` early-return block in the route source, so a preview
// call can never reach it.
const here = fileURLToPath(new URL('.', import.meta.url))
const routeSource = readFileSync(
  join(here, '..', '..', 'server', 'api', 'dashboard', 'locations', 'add.post.ts'),
  'utf8',
)

test('locations/add.post.ts only charges google_places_details after the previewOnly early return', () => {
  const previewReturnIndex = routeSource.indexOf('if (previewOnly)')
  assert.ok(previewReturnIndex >= 0, 'expected an `if (previewOnly)` branch in the route')

  const chargeDetailsIndex = routeSource.indexOf("action: 'google_places_details'")
  assert.ok(chargeDetailsIndex >= 0, 'expected a google_places_details chargeFlatCredits call in the route')

  assert.ok(
    chargeDetailsIndex > previewReturnIndex,
    'google_places_details must be charged after the previewOnly early return, not before it — ' +
    'charging before it means every preview call (in addition to every real creation call) bills ' +
    'the org, double-charging one logical add-location operation',
  )
})

test('locations/add.post.ts charges google_places_search (when used) after the previewOnly early return too', () => {
  const previewReturnIndex = routeSource.indexOf('if (previewOnly)')
  const chargeSearchIndex = routeSource.indexOf("action: 'google_places_search'")
  assert.ok(chargeSearchIndex >= 0, 'expected a google_places_search chargeFlatCredits call in the route')
  assert.ok(
    chargeSearchIndex > previewReturnIndex,
    'google_places_search must also be deferred past the previewOnly early return for the same reason',
  )
})

test('the previewOnly response is returned before any chargeFlatCredits call in source order', () => {
  const previewReturnIndex = routeSource.indexOf('return jsonResponse({\n      success: true,\n      preview:')
  assert.ok(previewReturnIndex >= 0, 'expected the preview-only success response in the route')
  const firstChargeIndex = routeSource.indexOf('chargeFlatCredits(')
  assert.ok(firstChargeIndex >= 0, 'expected at least one chargeFlatCredits call')
  assert.ok(
    firstChargeIndex > previewReturnIndex,
    'no chargeFlatCredits call should occur before the previewOnly response is built and returned',
  )
})
