import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

function vueFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? vueFiles(path) : entry.name.endsWith('.vue') ? [path] : []
  })
}

test('navbar leading resolves detail back, mobile scope back, then desktop collapse', () => {
  const source = read('lib/components/workspace/dashboard/DashboardNavbarLeading.vue')
  const detail = source.indexOf('v-if="detailParent"')
  const scope = source.indexOf('v-if="scopeParent"')
  const collapse = source.indexOf('<DashboardSidebarCollapseButton />')

  assert.ok(detail >= 0)
  assert.ok(scope > detail)
  assert.ok(collapse > scope)
  assert.match(source, /class="min-w-0 shrink-0 md:hidden"/)
  assert.match(source, /icon="i-lucide-chevron-left"/)
  assert.doesNotMatch(source, /router\.back|history\.back/)
})

test('sidebar collapse is desktop-only outside the sidebar header', () => {
  const source = read('lib/components/workspace/dashboard/DashboardSidebarCollapseButton.vue')
  assert.match(source, /sidebar \? '' : 'hidden md:flex'/)
  assert.doesNotMatch(source, /route\.path|mobileBackPath/)
})

test('detail navbar routes declare their stable parent indexes', () => {
  const expected = [
    ['pages/dashboard/[orgSlug]/sites/[siteSlug]/conversations/[conversationId].vue', 'detail-label="Assistant"'],
    ['pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/index.vue', 'detail-label="Locations"'],
    ['pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/menu/items/[itemId].vue', 'detail-label="Menu"'],
    ['pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/menu/items/new.vue', 'detail-label="Menu"'],
    ['pages/admin/content/[page].vue', 'detail-to="/admin/content"'],
    ['pages/admin/docs/[docId].vue', 'detail-to="/admin/docs"'],
    ['pages/admin/docs/new.vue', 'detail-to="/admin/docs"'],
  ] as const

  for (const [path, marker] of expected) assert.match(read(path), new RegExp(marker))
  assert.match(read('lib/components/workspace/inbox/GuestThreadInbox.vue'), /:detail-to="isDetailMode \? listRoute : null"/)
})

test('every dashboard navbar delegates its leading slot to the shared resolver', () => {
  const files = [
    ...vueFiles('pages/admin'),
    ...vueFiles('pages/dashboard'),
    ...vueFiles('lib/components/workspace'),
  ]

  for (const path of files) {
    const source = read(path)
    if (!source.includes('<UDashboardNavbar')) continue
    assert.match(source, /<template #leading>/, `${path} has a leading slot`)
    assert.match(source, /<DashboardNavbarLeading/, `${path} uses the shared leading resolver`)
  }
})

test('account index returns to the workspace and detail pages return to account', () => {
  assert.match(read('pages/dashboard/account/index.vue'), /<DashboardNavbarLeading back-to-organization icon-only \/>/)
  for (const page of ['profile.vue', 'authentication.vue', 'billing-items.vue']) {
    assert.match(read(`pages/dashboard/account/${page}`), /:detail-to="accountIndexTo" detail-label="Account" icon-only/)
  }
})
