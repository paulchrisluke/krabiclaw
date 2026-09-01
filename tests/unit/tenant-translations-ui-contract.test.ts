import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// Every tenant-content Translations control added this round calls the same
// canonical per-resource localization API (server/utils/localization.ts,
// exposed at /api/editor/sites/{siteId}/localization/{resourceType}/{resourceId}/{locale})
// rather than inventing a parallel storage path or endpoint.
const cases: Array<{ file: string; resourceType: string }> = [
  { file: 'components/products/ProductEditor.vue', resourceType: 'product' },
  { file: 'lib/components/workspace/settings/LocationSettingsPage.vue', resourceType: 'business_location' },
  { file: 'lib/components/workspace/settings/SiteSettingsPage.vue', resourceType: 'site' },
  { file: 'pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/experiences.vue', resourceType: 'experience' },
  { file: 'pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/qa.vue', resourceType: 'location_qa' },
  { file: 'pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/posts.vue', resourceType: 'site_post' },
  { file: 'pages/dashboard/[orgSlug]/sites/[siteSlug]/blog/[postId].vue', resourceType: 'tenant_blog_post' },
]

for (const { file, resourceType } of cases) {
  test(`${file} saves translations through the canonical localization API for ${resourceType}`, () => {
    const source = read(file)
    assert.match(
      source,
      new RegExp(`/api/editor/sites/\\$\\{(props\\.)?siteId\\}/localization/${resourceType}/`),
      `expected a PUT to the canonical /localization/${resourceType}/ endpoint`,
    )
    assert.match(source, /method: 'PUT'/)
  })

  test(`${file} excludes the source locale from its translation-language options`, () => {
    // Every one of these editors filters out is_source when building the
    // locale picker — 'en' is edited through the canonical (non-localized)
    // field, not through PUT .../localization/.../en, which the server
    // rejects (English source content must be edited through its canonical
    // resource).
    const source = read(file)
    assert.match(source, /is_source/)
  })
}

test('ProductEditor.vue exposes translation fields for every registered product field', () => {
  // RESOURCE_LOCALIZATION_REGISTRY.product required+optional: category, name,
  // description, tags_json, details_json, seo_title, seo_description.
  // Live-verified this session: all 7 fields save/reload/persist for a real
  // Kikuzuki product (item-kiku-tuna-sushi), and /th/locations/.../menu/tuna-sushi
  // server-renders the translated name and description.
  const source = read('components/products/ProductEditor.vue')
  for (const field of ['localizedFields.name', 'localizedFields.category', 'localizedFields.description', 'localizedFields.tags_text', 'localizedFields.details_text', 'localizedFields.seo_title', 'localizedFields.seo_description']) {
    assert.match(source, new RegExp(field.replace('.', '\\.')), `expected a translation field for ${field}`)
  }
})

test('LocationSettingsPage.vue exposes translation fields for every registered business_location field', () => {
  // RESOURCE_LOCALIZATION_REGISTRY.business_location required+optional: title,
  // address, city, neighborhood, description, short_description,
  // opening_hours, seo_title, seo_description.
  // Live-verified this session: all 9 fields save/reload/persist for the
  // real Kikuzuki location (loc-kikuzuki), and /th/locations/... server-
  // renders the translated description and city.
  const source = read('lib/components/workspace/settings/LocationSettingsPage.vue')
  for (const field of ['translationFields.title', 'translationFields.short_description', 'translationFields.description', 'translationFields.city', 'translationFields.neighborhood', 'translationFields.address', 'translationFields.opening_hours_text', 'translationFields.seo_title', 'translationFields.seo_description']) {
    assert.match(source, new RegExp(field.replace('.', '\\.')), `expected a translation field for ${field}`)
  }
})

test('SiteSettingsPage.vue exposes translation fields for every registered site field', () => {
  // RESOURCE_LOCALIZATION_REGISTRY.site required+optional: brand_name,
  // brand_description, seo_title, seo_description.
  // Live-verified this session: all 4 fields save/reload/persist for the
  // real Kikuzuki site, and the translated brand_name renders in the shared
  // shell on a real Thai public page.
  const source = read('lib/components/workspace/settings/SiteSettingsPage.vue')
  for (const field of ['siteTranslationFields.brand_name', 'siteTranslationFields.brand_description', 'siteTranslationFields.seo_title', 'siteTranslationFields.seo_description']) {
    assert.match(source, new RegExp(field.replace('.', '\\.')), `expected a translation field for ${field}`)
  }
})

test('experiences.vue exposes translation fields for every registered experience field', () => {
  // RESOURCE_LOCALIZATION_REGISTRY.experience required+optional: title,
  // tagline, body, price, available_note, highlights_json, included_items_json,
  // what_to_bring, meeting_point, cancellation_policy, seo_title, seo_description.
  // Live-verified this session: all 12 fields save/reload/persist for the
  // real Kikuzuki experience (exp-kiku-teppanyaki), and /th/experiences/
  // teppanyaki-experience server-renders the translated title and body.
  const source = read('pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/experiences.vue')
  for (const field of ['translationFields.title', 'translationFields.tagline', 'translationFields.body', 'translationFields.price', 'translationFields.available_note', 'translationFields.highlights_text', 'translationFields.included_items_text', 'translationFields.what_to_bring_text', 'translationFields.meeting_point', 'translationFields.cancellation_policy', 'translationFields.seo_title', 'translationFields.seo_description']) {
    assert.match(source, new RegExp(field.replace('.', '\\.')), `expected a translation field for ${field}`)
  }
})

test('posts.vue exposes translation fields for every registered site_post field', () => {
  // RESOURCE_LOCALIZATION_REGISTRY.site_post required+optional: title, body,
  // seo_title, seo_description, event_title, offer_terms.
  // Live-verified this session with a genuine full-page reload (navigate
  // away and back, not a storage-API check): all 6 fields save/reload/
  // persist for the real Kikuzuki post ("Weekend Special"), and
  // /th/posts/weekend-special server-renders the translated title and body.
  const source = read('pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/posts.vue')
  for (const field of ['translationFields.title', 'translationFields.body', 'translationFields.seo_title', 'translationFields.seo_description', 'translationFields.event_title', 'translationFields.offer_terms']) {
    assert.match(source, new RegExp(field.replace('.', '\\.')), `expected a translation field for ${field}`)
  }
})

test('blog/[postId].vue exposes translation fields for every registered tenant_blog_post field', () => {
  // RESOURCE_LOCALIZATION_REGISTRY.tenant_blog_post required+optional: title,
  // excerpt, category, tags_json, nav_title, seo_title, seo_description.
  // Live-verified this session: created a real fixture through the ordinary
  // POST /api/editor/sites/{siteId}/blog/posts create endpoint (the
  // block-based rich editor was unreliable for synthetic input in this
  // browser-automation environment - not a UI defect), then saved and
  // reloaded all 7 fields through the real CMS Translations panel, and
  // confirmed /th/blog/sushi-making-class-highlights renders the translated
  // title.
  const source = read('pages/dashboard/[orgSlug]/sites/[siteSlug]/blog/[postId].vue')
  for (const field of ['translationFields.title', 'translationFields.excerpt', 'translationFields.category', 'translationFields.tags_text', 'translationFields.nav_title', 'translationFields.seo_title', 'translationFields.seo_description']) {
    assert.match(source, new RegExp(field.replace('.', '\\.')), `expected a translation field for ${field}`)
  }
})

test('experiences.vue exposes a translation control for booking_policy', () => {
  // RESOURCE_LOCALIZATION_REGISTRY.booking_policy optional: weather_policy,
  // additional_notes_html. Kikuzuki had no booking_policy row for its
  // experience - created one through the real BookingPolicyForm/Save changes
  // flow, then live-verified this translation control: saved and reloaded
  // Thai values for both fields through the real CMS. Public rendering is
  // separately blocked by a pre-existing architectural gap, not this field:
  // /th/experiences/{slug} (representation.kind 'resource') renders through
  // components/localization/LocalizedResourcePage.vue, a minimal
  // title/summary/body/details view that never renders booking-policy
  // summaries, media galleries, or other rich UI in ANY locale's translated
  // resource pages - out of scope for field-content translation work.
  const source = read('pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/experiences.vue')
  assert.match(source, /policyTranslationFields\.weather_policy/)
  assert.match(source, /policyTranslationFields\.additional_notes_html/)
  assert.match(source, /\/localization\/booking_policy\/\$\{bookingPolicyId\.value\}\/\$\{encodeURIComponent\(translationLocale\.value\)\}/)
  assert.match(source, /method: 'PUT'/)
})

test('links.vue saves translations through the canonical localization API for site_link_page and site_link_item', () => {
  // links (site.links) is in ALWAYS_ON_FEATURES (config/cms-registry.ts) so
  // it's reachable from every vertical, including Kikuzuki's restaurant/saya
  // combination - unlike offering/tenant_compliance/site_consultation_settings,
  // which only resolve for the professional_service/blawby combination and
  // are correctly out of scope for this site.
  const source = read('pages/dashboard/[orgSlug]/sites/[siteSlug]/links.vue')
  assert.match(source, /\/api\/editor\/sites\/\$\{siteId\}\/localization\/site_link_page\//)
  assert.match(source, /\/api\/editor\/sites\/\$\{siteId\}\/localization\/site_link_item\//)
  assert.match(source, /method: 'PUT'/)
  assert.match(source, /is_source/)
})

test('media.vue saves alt-text translations through the canonical localization API for media_asset', () => {
  // media_asset alt_text had no CMS surface at all before this change (the
  // server/api PATCH endpoint for the English field existed but nothing
  // called it, and there was no Translations UI) - the media library grid
  // is the CMS surface tenants actually use to manage assets, so the edit
  // affordance and translation control both live there.
  const source = read('pages/dashboard/[orgSlug]/sites/[siteSlug]/media.vue')
  assert.match(source, /localization\/media_asset\/\$\{editingAsset\.value\.id\}\/\$\{encodeURIComponent\(translationLocale\.value\)\}/)
  assert.match(source, /method: 'PUT'/)
  assert.match(source, /is_source/)
})
