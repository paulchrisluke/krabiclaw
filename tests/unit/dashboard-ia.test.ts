import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PLATFORM_DASHBOARD_ROUTE_ENTRIES, resolveDashboardPath } from '../../config/platform-knowledge.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('canonical organization, site, location, and settings route files exist', () => {
  for (const path of [
    'pages/dashboard/[orgSlug]/index.vue',
    'pages/dashboard/[orgSlug]/settings/index.vue',
    'pages/dashboard/[orgSlug]/sites/[siteSlug]/index.vue',
    'pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/index.vue',
    'pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/new.vue',
    'pages/dashboard/[orgSlug]/sites/[siteSlug]/domains.vue',
    'pages/dashboard/[orgSlug]/sites/[siteSlug]/settings.vue',
    'pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/index.vue',
    'pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/settings.vue',
  ]) assert.equal(existsSync(resolve(root, path)), true, `missing canonical route ${path}`)
})

test('removed add-location and location-preference routes stay deleted', () => {
  assert.equal(existsSync(resolve(root, 'pages/dashboard/[orgSlug]/sites/[siteSlug]/new.vue')), false)
  assert.equal(existsSync(resolve(root, 'pages/dashboard/[orgSlug]/settings/domains.vue')), false)
  assert.equal(existsSync(resolve(root, 'server/api/dashboard/location-preference.patch.ts')), false)
})

test('dashboard context and location navigation never infer residual selections', () => {
  const context = source('server/utils/dashboard-context.ts')
  const contextRoute = source('server/api/dashboard/context.get.ts')
  const locations = source('composables/useDashboardLocation.ts')
  assert.doesNotMatch(context, /resolveSingleOrgSite|resolveSelectedDashboardLocation/)
  assert.doesNotMatch(contextRoute, /selectedLocation/)
  assert.doesNotMatch(locations, /route\.path|localStorage|preference/i)
})

test('every dashboard search route resolves to the canonical hierarchy', () => {
  const context = { orgSlug: 'org', siteSlug: 'site', locationSlug: 'location' }
  for (const entry of PLATFORM_DASHBOARD_ROUTE_ENTRIES) {
    const path = resolveDashboardPath(entry.pathTemplate, context)
    assert.ok(path)
    assert.doesNotMatch(path, /\/dashboard\/org\/~\//)
    if (entry.id.startsWith('location-')) assert.match(path, /\/sites\/site\/locations\/location(?:\/|$)/)
  }
})

test('organization, site, and location settings use separate page components', () => {
  assert.match(source('pages/dashboard/[orgSlug]/settings/index.vue'), /OrganizationSettingsPage/)
  assert.match(source('pages/dashboard/[orgSlug]/sites/[siteSlug]/settings.vue'), /SiteSettingsPage/)
  assert.match(source('pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/settings.vue'), /id="location-settings"/)
  assert.match(source('pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/index.vue'), /id="location-overview"/)
})

test('every experience mutation and availability route authorizes the experience location', () => {
  for (const path of [
    'server/api/editor/sites/[siteId]/experiences/index.post.ts',
    'server/api/editor/sites/[siteId]/experiences/[experienceId]/index.patch.ts',
    'server/api/editor/sites/[siteId]/experiences/[experienceId]/index.delete.ts',
    'server/api/editor/sites/[siteId]/experiences/[experienceId]/availability.get.ts',
    'server/api/editor/sites/[siteId]/experiences/[experienceId]/slot-overrides.get.ts',
    'server/api/editor/sites/[siteId]/experiences/[experienceId]/slot-overrides.post.ts',
    'server/api/editor/sites/[siteId]/experiences/[experienceId]/slot-overrides/[overrideId].delete.ts',
  ]) {
    const route = source(path)
    assert.match(route, /assertResourceAccess/, `${path} must apply a resource guard`)
    assert.doesNotMatch(route, /m\.role IN \('owner','admin'\)/, `${path} must not exclude scoped editors by role name`)
  }
})
