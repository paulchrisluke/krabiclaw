import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// The field-editing engine lives in CmsContentEditor.vue (shared by the
// site-scoped and location-scoped content/index.vue host pages, plus their
// content/[pageId].vue siblings) since #316 phase 3 split the formerly-
// monolithic content.vue into thin per-scope hosts plus this shared
// component; issue #324 later replaced the ?page=/?location= query-param
// scheme those hosts used with real content/[pageId] routes.
const editorPath = new URL('../../components/workspace/content/CmsContentEditor.vue', import.meta.url)
const editorSource = readFileSync(editorPath, 'utf8')
const linksSource = readFileSync(new URL('../../composables/useDashboardSiteLinks.ts', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../../layouts/dashboard.vue', import.meta.url), 'utf8')
const siteContentHostSource = readFileSync(
  new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/content/index.vue', import.meta.url),
  'utf8',
)
const locationContentHostSource = readFileSync(
  new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/content/index.vue', import.meta.url),
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
  assert.match(editorSource, /currentValues\.value\[activeField\.value\] !== editingValue\.value/)
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

test('CMS content host page disables SSR; editor uses $fetch for client-side fetching and avoids useFetch/useRequestFetch', () => {
  // The content host page explicitly opts out of SSR, so the nested self-fetch
  // / cloudflareEnv pattern is not needed — verifying ssr: false is present is
  // the equivalent contract for this surface.
  assert.match(siteContentHostSource, /ssr:\s*false/)

  // The editor component must never introduce useFetch or useRequestFetch —
  // those bypass cloudflare bindings in SSR (see AGENTS.md) and are
  // unnecessary here since SSR is disabled on the host page.
  assert.doesNotMatch(editorSource, /useFetch\b/)
  assert.doesNotMatch(editorSource, /useRequestFetch\b/)

  // Client-side fetching uses $fetch (the correct pattern for ssr:false pages).
  assert.match(editorSource, /\$fetch/)
})

test('CMS content host pages render shared editor with siteId prop', () => {
  assert.match(siteContentHostSource, /<CmsContentEditor[^>]*:site-id="siteId"/)
  assert.match(locationContentHostSource, /<CmsContentEditor[^>]*:site-id="siteId"/)
})

test('page selection uses real content/[pageId] routes, not ?page=/?location= query params (issue #324)', () => {
  assert.doesNotMatch(editorSource, /route\.query\.page/)
  assert.doesNotMatch(editorSource, /route\.query\.location/)
  assert.doesNotMatch(linksSource, /query:\s*page\s*\?\s*\{\s*page\s*\}/)
  assert.doesNotMatch(linksSource, /page:\s*'location'/)
  assert.match(editorSource, /pageId\?:\s*string/)
})
