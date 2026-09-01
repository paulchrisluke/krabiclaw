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
