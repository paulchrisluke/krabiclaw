import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contextSource = readFileSync(
  new URL('../../server/utils/dashboard-context.ts', import.meta.url),
  'utf8',
)
const composableSource = readFileSync(
  new URL('../../composables/useDashboardSite.ts', import.meta.url),
  'utf8',
)
const pluginSource = readFileSync(
  new URL('../../plugins/dashboard-site-header.client.ts', import.meta.url),
  'utf8',
)
const dashboardEntrySource = readFileSync(
  new URL('../../pages/dashboard/index.vue', import.meta.url),
  'utf8',
)
const postLoginSource = readFileSync(
  new URL('../../server/api/post-login.get.ts', import.meta.url),
  'utf8',
)
const dashboardLayoutSource = readFileSync(
  new URL('../../layouts/dashboard.vue', import.meta.url),
  'utf8',
)

test('dashboard organization resolution uses the route organization or Better Auth active organization', () => {
  assert.match(contextSource, /getHeader\(event, 'x-dashboard-org-slug'\)/)
  assert.match(contextSource, /AND o\.slug = \?/)
  assert.match(contextSource, /sessionRecord\.activeOrganizationId/)
  assert.match(contextSource, /AND o\.id = \?/)
  assert.doesNotMatch(contextSource, /ORDER BY CASE WHEN o\.id = \? THEN 0 ELSE 1 END/)
})

test('dashboard requests forward the organization slug on SSR and client navigation', () => {
  assert.match(composableSource, /headers\.set\('x-dashboard-org-slug', orgSlug\)/)
  assert.match(pluginSource, /headers\.set\('x-dashboard-org-slug', orgSlug\)/)
})

test('bare dashboard delegates to the server-side authenticated entry router', () => {
  assert.match(dashboardEntrySource, /navigateTo\('\/api\/post-login'/)
  assert.doesNotMatch(dashboardEntrySource, /useDashboardSite\(/)
  assert.doesNotMatch(postLoginSource, /sendRedirect\(event, '\/dashboard'\)/)
})

test('general Content sidebar link opens the site-scoped content page', () => {
  assert.match(dashboardLayoutSource, /label: 'Content', icon: 'i-lucide-copy', to: `\$\{siteBase\.value\}\/content`/)
  assert.doesNotMatch(dashboardLayoutSource, /label: 'Content'[^\n]+content\?page=location/)
})
