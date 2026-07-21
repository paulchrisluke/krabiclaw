import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// The field-editing engine lives in CmsContentEditor.vue (shared by the
// site-scoped and location-scoped content.vue host pages) since #316 phase 3
// split the formerly-monolithic content.vue into a thin per-scope host plus
// this shared component.
const editorPath = new URL('../../components/workspace/content/CmsContentEditor.vue', import.meta.url)
const editorSource = readFileSync(editorPath, 'utf8')
const linksSource = readFileSync(new URL('../../composables/useDashboardSiteLinks.ts', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../../layouts/dashboard.vue', import.meta.url), 'utf8')

test('universal CMS content route is scoped by siteId and no longer depends on the dashboard self-fetch proxy', () => {
  assert.match(linksSource, /content: `\$\{siteBase\}\/content`/)
  assert.doesNotMatch(editorSource, /\/api\/dashboard\/editor/)
  assert.match(editorSource, /\/api\/editor\/sites\/\$\{props\.siteId\}\/content\/\$\{selectedPageId\.value\}/)
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
  assert.match(layoutSource, /`\$\{siteBase\.value\}\/content`/)
})

test('CMS status never fabricates a Live state from local dirty state', () => {
  assert.doesNotMatch(editorSource, /localHasChanges \? 'Unsaved' : 'Live'/)
  assert.match(editorSource, /siteStatusLabel/)
})
