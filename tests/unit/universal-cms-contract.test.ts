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

test('the Pages manager owns the complete current-content lifecycle', () => {
  for (const pattern of [
    /Add block/,
    /Duplicate block/,
    /Delete block/,
    /Move block up/,
    /Move block down/,
    /Preview/,
    />Save</,
  ]) assert.match(managerSource, pattern)
  assert.doesNotMatch(managerSource, /Publish|Unpublish|Archive|Restore/)
  assert.match(managerSource, /expectedDocumentUpdatedAt/)
  assert.match(managerSource, /TenantPageBlockEditor/)
  assert.match(managerSource, /draggable="true"/)
  assert.doesNotMatch(managerSource, /Block data JSON/)
  assert.doesNotMatch(managerSource, /blockJson/)
})

test('the Pages manager previews against the Worker serving the dashboard', () => {
  assert.match(managerSource, /const platformOrigin = useRequestURL\(\)\.origin/)
  assert.match(managerSource, /`\$\{platformOrigin\}\/preview\/site\//)
  assert.doesNotMatch(managerSource, /config\.public\.(?:platformDomain|freeSiteDomain)/)
})

test('legacy field-based dashboard editor paths are not referenced', () => {
  assert.doesNotMatch(managerSource, /content\/save/)
  assert.doesNotMatch(managerSource, /content-editor/)
  assert.doesNotMatch(linksSource, /paths\.value\.content/)
})
