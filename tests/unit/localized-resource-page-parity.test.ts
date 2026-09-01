import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

const tenantPath = read('pages/[...tenantPath].vue')
const registry = read('server/utils/localization-registry.ts')
const publicLocalization = read('server/utils/public-localization.ts')
const experiencesEditor = read('pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/experiences.vue')
const bookingPolicies = read('server/utils/booking-policies.ts')

test('translated resource pages (experience/location/product/site_post/tenant_blog_post) render through their real Saya template, not the generic fallback', () => {
  // Regression: before this, every 'resource'-kind representation (any
  // registry route: 'location' | 'product' | 'experience' | 'site_post' |
  // 'tenant_blog_post') rendered through LocalizedResourcePage - a minimal
  // title/summary/body/details view with no gallery, booking-policy summary,
  // sub-nav, or structured data. Live-verified this session: /th/experiences/
  // teppanyaki-experience, /th/locations/kikuzuki-japanese-robatayaki-izakaya,
  // /th/locations/.../menu/tuna-sushi, /th/posts/weekend-special, and
  // /th/blog/sushi-making-class-highlights all now render their real themed
  // component (gallery, JSON-LD, breadcrumbs, booking-policy text, etc.)
  // with matching English regression routes unaffected.
  for (const component of ['ExperienceDetailPage', 'LocationDetailPage', 'ProductDetailRoutePage', 'PostDetailPage', 'BlogPostDetailPage']) {
    assert.match(tenantPath, new RegExp(`<${component}[\\s\\S]*?v-else-if="localizedRoute\\?\\.representation\\.kind === 'resource'`), `expected ${component} to be dispatched before the generic LocalizedResourcePage fallback`)
  }
})

test('the experience registry field is pricing_note, matching the canonical Experience field name exactly', () => {
  // Regression: the registry previously called this field 'price', which
  // collided with the canonical Experience.price STRUCTURED object
  // ({amount_minor, currency, ...}). Once a translated experience rendered
  // through the real ExperienceDetailPage (which calls
  // formatMinorAmount(experience.price.amount_minor, ...)), the overlay had
  // clobbered canonical.price with a translated string, and the public page
  // 500'd with "amount_minor must be a non-negative safe integer".
  assert.match(registry, /optional: \['tagline', 'body', 'pricing_note',/)
  assert.doesNotMatch(registry, /optional: \['tagline', 'body', 'price',/)
  assert.match(experiencesEditor, /translationFields\.pricing_note/)
  assert.doesNotMatch(experiencesEditor, /translationFields\.price\b/)
})

test('business_location opening_hours is projected under a different key than the canonical field', () => {
  // Regression: the canonical business_locations.opening_hours is a
  // structured Google Places hours object (consumed by
  // formatGoogleHours/getTodayGoogleHours); the CMS translation form stores
  // the translated value as a newline-per-day string array under the same
  // field name. Overlaying it directly to render a translated
  // LocationDetailPage would hand formatGoogleHours the wrong shape (found
  // by code review after the identical experience.price collision crashed a
  // live page - fixed defensively before it could do the same here).
  assert.match(publicLocalization, /business_location: \{[\s\S]*?opening_hours: 'opening_hours_translated',/)
})

test('normalizeBoolean accepts null the same way normalizeString already does', () => {
  // Regression: booking policy boolean fields (reschedule_allowed,
  // deposit_required, special_requests_allowed, accessibility_contact_required)
  // are legitimately null when unset (rowToPolicy/seedDefaultsForScope), and
  // the client round-trips the full policy object - including untouched
  // null fields - on every save. normalizeBoolean rejected null with "must
  // be a boolean", so ANY booking-policy save with an unset boolean field
  // 400'd - this silently blocked every real save through the CMS UI
  // (a raw fetch sending only the touched fields never hit it).
  assert.match(bookingPolicies, /function normalizeBoolean\(value: unknown, field: string\) \{\s*if \(value === undefined\) return undefined\s*[\s\S]*?if \(value === null\) return null/)
})

test("experiences.vue's openEdit awaits the booking-policy load before opening the editor", () => {
  // Regression: openEdit() fired loadExperiencePolicy() without awaiting it
  // and opened the slider immediately. A user editing weather_policy before
  // the in-flight GET resolved had their edit silently overwritten by the
  // stale response the moment it landed - the save appeared to succeed but
  // persisted the pre-edit (often null) value.
  assert.match(experiencesEditor, /async function openEdit\(exp: ApiRecord\) \{/)
  assert.match(experiencesEditor, /await loadExperiencePolicy\(exp\.id, currentLocationId\.value \?\? exp\.location_id\)\s*\n\s*sliderOpen\.value = true/)
})
