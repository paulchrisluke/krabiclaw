import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// The field-editing engine lives in CmsContentEditor.vue, rendered only by
// the content/[pageId].vue editor routes (site-scoped and location-scoped).
// Page selection itself lives one level up in ContentPageIndex.vue, rendered
// by the content/index.vue routes as an ordinary UDashboardPanel page — #316
// phase 3 first split the formerly-monolithic content.vue into per-scope
// hosts plus CmsContentEditor.vue; issue #324 later replaced the
// ?page=/?location= query-param scheme those hosts used with real
// content/[pageId] routes, and a follow-up pass moved page *selection* out
// of the full-screen editor entirely so the editor only ever renders one
// already-chosen page.
const editorPath = new URL('../../components/workspace/content/CmsContentEditor.vue', import.meta.url)
const editorSource = readFileSync(editorPath, 'utf8')
const nuxtConfigSource = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
const pageIndexSource = readFileSync(new URL('../../components/workspace/content/ContentPageIndex.vue', import.meta.url), 'utf8')
const linksSource = readFileSync(new URL('../../composables/useDashboardSiteLinks.ts', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../../layouts/dashboard.vue', import.meta.url), 'utf8')
const siteContentIndexHostSource = readFileSync(
  new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/content/index.vue', import.meta.url),
  'utf8',
)
const locationContentIndexHostSource = readFileSync(
  new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/content/index.vue', import.meta.url),
  'utf8',
)
const siteContentEditorHostSource = readFileSync(
  new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/content/[pageId].vue', import.meta.url),
  'utf8',
)
const locationContentEditorHostSource = readFileSync(
  new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/content/[pageId].vue', import.meta.url),
  'utf8',
)

test('universal CMS content route is scoped by siteId and no longer depends on the dashboard self-fetch proxy', () => {
  assert.match(linksSource, /content: `\${siteBase}\/content`/)
  assert.doesNotMatch(editorSource, /\/api\/dashboard\/editor/)
  assert.match(editorSource, /\/api\/editor\/sites\/\${props\.siteId}\/content\/\${selectedPageId\.value}/)
  assert.match(editorSource, /\{ fields: ApiRecord\[\] \}/)
})

test('universal CMS uses one page-level save model', () => {
  assert.doesNotMatch(editorSource, /id="field-apply-btn"/)
  assert.doesNotMatch(editorSource, /const applyField/)
  assert.match(editorSource, /\(currentValues\.value\[activeField\.value\] \|\| ''\) !== editingValue\.value/)
  assert.match(editorSource, /onBeforeRouteLeave/)
  assert.match(editorSource, /Discard unsaved content changes/)
})

test('dashboard content navigation does not force a location page', () => {
  assert.doesNotMatch(layoutSource, /content\?page=location/)
  assert.match(layoutSource, /`\${siteBase\.value}\/content`/)
})

test('CMS status never fabricates a Live state from local dirty state', () => {
  assert.doesNotMatch(editorSource, /localHasChanges \? 'Unsaved' : 'Live'/)
  assert.match(editorSource, /siteStatusLabel/)
})

test('CMS editor host routes disable SSR via routeRules; editor uses $fetch for client-side fetching and avoids useFetch/useRequestFetch', () => {
  // ssr:false must come from routeRules (read by Nitro before any Vue
  // rendering starts), not definePageMeta — a page-level ssr:false depends on
  // Nuxt's page-render path resolving first, which isn't a guarantee at the
  // same level as a routeRules match. Both editor host routes need an entry.
  assert.match(nuxtConfigSource, /'\/dashboard\/\*\/sites\/\*\/content\/\*':\s*{\s*ssr:\s*false\s*}/)
  assert.match(nuxtConfigSource, /'\/dashboard\/\*\/sites\/\*\/locations\/\*\/content\/\*':\s*{\s*ssr:\s*false\s*}/)
  assert.doesNotMatch(siteContentEditorHostSource, /ssr:\s*false/)
  assert.doesNotMatch(locationContentEditorHostSource, /ssr:\s*false/)

  // The editor component must never introduce useFetch or useRequestFetch —
  // those bypass cloudflare bindings in SSR (see AGENTS.md) and are
  // unnecessary here since SSR is disabled on the host page.
  assert.doesNotMatch(editorSource, /useFetch\b/)
  assert.doesNotMatch(editorSource, /useRequestFetch\b/)

  // Client-side fetching uses $fetch (the correct pattern for ssr:false pages).
  assert.match(editorSource, /\$fetch/)
})

test('CMS content editor host pages render the shared editor with siteId and pageId props', () => {
  assert.match(siteContentEditorHostSource, /<CmsContentEditor[^>]*:site-id="siteId"/)
  assert.match(siteContentEditorHostSource, /<CmsContentEditor[^>]*:page-id="pageId"/)
  assert.match(locationContentEditorHostSource, /<CmsContentEditor[^>]*:site-id="siteId"/)
  assert.match(locationContentEditorHostSource, /<CmsContentEditor[^>]*:page-id="pageId"/)
})

test('page selection uses real content/[pageId] routes, not ?page=/?location= query params (issue #324)', () => {
  assert.doesNotMatch(editorSource, /route\.query\.page/)
  assert.doesNotMatch(editorSource, /route\.query\.location/)
  assert.doesNotMatch(linksSource, /query:\s*page\s*\?\s*\{\s*page\s*\}/)
  assert.doesNotMatch(linksSource, /page:\s*'location'/)
  assert.match(editorSource, /pageId:\s*string/)
})

test('page selection lives in ContentPageIndex, not in the full-screen editor', () => {
  // CmsContentEditor requires a pageId — it never renders a page picker itself.
  assert.doesNotMatch(editorSource, /pageId\?:\s*string/)
  assert.doesNotMatch(editorSource, /uppercase tracking-wide text-muted">Pages</)

  // The index host pages use the ordinary dashboard shell, not the full-screen
  // editor layout — page selection is dashboard chrome, not part of the editor.
  assert.match(siteContentIndexHostSource, /layout:\s*'dashboard'/)
  assert.match(locationContentIndexHostSource, /layout:\s*'dashboard'/)
  assert.match(siteContentIndexHostSource, /<ContentPageIndex/)
  assert.match(locationContentIndexHostSource, /<ContentPageIndex/)
  assert.match(pageIndexSource, /getEditablePages/)
})
