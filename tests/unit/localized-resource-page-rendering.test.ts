import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const nuxtConfig = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
const tenantPath = readFileSync(new URL('../../pages/[...tenantPath].vue', import.meta.url), 'utf8')
const i18nPlugin = readFileSync(new URL('../../plugins/i18n.ts', import.meta.url), 'utf8')
const localizationUtil = readFileSync(new URL('../../server/utils/localization.ts', import.meta.url), 'utf8')
const publicPageRequest = readFileSync(new URL('../../composables/usePublicPageRequest.ts', import.meta.url), 'utf8')
const qaPage = readFileSync(new URL('../../pages/locations/[slug]/qa.vue', import.meta.url), 'utf8')
const photosPage = readFileSync(new URL('../../pages/locations/[slug]/photos.vue', import.meta.url), 'utf8')
const publicPageUtil = readFileSync(new URL('../../server/utils/public-page.ts', import.meta.url), 'utf8')

test('components/localization is registered so <LocalizedResourcePage> resolves at runtime', () => {
  // Regression: this directory was never added to the components scan array,
  // so Vue silently rendered <LocalizedResourcePage> as an empty fragment
  // instead of throwing — every localized resource page (product, location,
  // experience, ...) rendered a blank <main>.
  assert.match(nuxtConfig, /path:\s*'~\/components\/localization'/)
})

test('locale is applied imperatively at route resolution, not via a reactive watch', () => {
  // Regression: plugins/i18n.ts previously bridged useState('public-locale')
  // into vue-i18n via watch(..., { immediate: true }), which only fires once
  // at plugin-init time (locale='en') and is not guaranteed to re-fire in
  // time during SSR before descendant components call t(). The page must
  // call the exposed setter directly, synchronously, in its own setup.
  assert.match(i18nPlugin, /nuxtApp\.provide\('setAppLocale',/)
  assert.doesNotMatch(i18nPlugin, /watch\(\[publicLocale, platformMessages\]/)
  assert.match(tenantPath, /\$setAppLocale\(localizedRoute\.value\.locale, localizedRoute\.value\.platform_messages\)/)
})

test('location_qa has no route_path of its own, so a Thai /locations/{slug}/qa request resolves through a dedicated fallback', () => {
  // Regression: location_qa's registry entry is route: 'none' - its rows are
  // never independently routable, so the exact route_path lookup and the
  // tenant_page_variants lookup both 404 for /th/locations/{slug}/qa even
  // though the underlying Q&A content and translations are real and saved.
  // slug is not a localizable business_location field, so it's safe to match
  // the canonical (English) slug directly instead of requiring a translated
  // route_path to exist.
  assert.match(localizationUtil, /kind:\s*'location_subpage'/)
  assert.match(localizationUtil, /\/\^\\\/locations\\\/\(\[\^\/\]\+\)\\\/\(qa\|photos\)\$\//)
})

test('the tenantPath catch-all renders the matching shared component per location_subpage sub_page', () => {
  assert.match(tenantPath, /<LocationQaPage[\s\S]*?v-else-if="localizedRoute\?\.representation\.kind === 'location_subpage' && localizedRoute\.representation\.sub_page === 'qa'"/)
  assert.match(tenantPath, /<LocationPhotosPage[\s\S]*?v-else-if="localizedRoute\?\.representation\.kind === 'location_subpage' && localizedRoute\.representation\.sub_page === 'photos'"/)
})

test('the English location sub-pages and the Thai catch-all render the same components, not duplicated logic', () => {
  assert.match(qaPage, /<LocationQaPage\s*\/>/)
  assert.match(photosPage, /<LocationPhotosPage\s*\/>/)
})

test('usePublicPageRequest strips the locale prefix before parsing the page path', () => {
  // Regression: route.path under the tenantPath catch-all still carries the
  // locale segment (e.g. /th/locations/{slug}/qa) - parsing it unstripped
  // fails the /^\/locations\// match and the request silently falls through
  // to the wrong page type.
  assert.match(publicPageRequest, /splitLocalePrefix\(rawPath\)\.tenantPagePath/)
})

test('a localized content-page 404 only fires when an English source variant actually exists', () => {
  // Regression: canonicalTenantPagePath('qa') always resolves to the
  // site-wide '/qa' path, even though built-in Saya sub-pages like
  // /locations/{slug}/qa have no CMS-authored page content at all (Kikuzuki
  // has no tenant_page_variants row at '/qa' in ANY locale). Requiring a
  // Thai '/qa' translation before the location's own translated Q&A entries
  // could render made every location sub-page 404 in every non-English
  // locale, regardless of whether resource_localizations already had real
  // translated content for the location.
  assert.match(publicPageUtil, /const sourcePage = await getPublicTenantPageForPath\(db, siteId, canonicalPath, \{ locale: sourceLocale, preview: isPreviewAuthorized \}\)/)
  assert.match(publicPageUtil, /if \(sourcePage\) \{\s*throw new HTTPError\(\{ statusCode: 404, statusMessage: 'Exact localized page was not found' \}\)/)
})
