import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const managerSource = readFileSync(new URL('../../lib/components/workspace/content/TenantPagesManager.vue', import.meta.url), 'utf8')
const routeSource = readFileSync(new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/pages.vue', import.meta.url), 'utf8')
const linksSource = readFileSync(new URL('../../composables/useDashboardSiteLinks.ts', import.meta.url), 'utf8')

test('the dashboard exposes one site-scoped Pages manager for every template', () => {
  assert.match(routeSource, /<TenantPagesManager\s*\/>/)
  assert.match(managerSource, /One page system for every template/)
  assert.match(linksSource, /paths\.value\.pages/)
})

test('the Pages manager owns the complete block lifecycle', () => {
  for (const pattern of [
    /Add block/,
    /Duplicate block/,
    /Delete block/,
    /Move block up/,
    /Move block down/,
    /Preview/,
    /Publish/,
    /Unpublish/,
    /Archive/,
    /Restore/,
  ]) assert.match(managerSource, pattern)
  assert.match(managerSource, /expectedDocumentUpdatedAt/)
})

test('legacy field-based dashboard editor paths are not referenced', () => {
  assert.doesNotMatch(managerSource, /content\/save/)
  assert.doesNotMatch(managerSource, /content-editor/)
  assert.doesNotMatch(linksSource, /paths\.value\.content/)
})
