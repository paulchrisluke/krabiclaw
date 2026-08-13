import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { allGuardableManagerKeys } from '../../config/cms-registry.ts'
import { PLATFORM_DASHBOARD_ROUTE_ENTRIES, resolveDashboardPath } from '../../config/platform-knowledge.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    if (['.nuxt', '.output', 'node_modules'].includes(entry)) continue
    const full = resolve(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) files.push(...collectSourceFiles(full))
    else if (/\.(vue|ts)$/.test(entry)) files.push(full)
  }
  return files
}

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

test('there is exactly one authenticated dashboard layout and sidebar implementation', () => {
  const dashboardLayout = source('layouts/dashboard.vue')
  assert.equal(existsSync(resolve(root, 'layouts/dashboard.vue')), true)
  assert.equal((dashboardLayout.match(/^\s*<UDashboardSidebar\b/gm) ?? []).length, 1)
  assert.equal((dashboardLayout.match(/^\s*<UNavigationMenu\b/gm) ?? []).length, 1)
  assert.equal((dashboardLayout.match(/^\s*<DashboardScopeHeader\b/gm) ?? []).length, 1)
})

test('removed add-location and location-preference routes stay deleted', () => {
  assert.equal(existsSync(resolve(root, 'pages/dashboard/[orgSlug]/sites/[siteSlug]/new.vue')), false)
  assert.equal(existsSync(resolve(root, 'pages/dashboard/[orgSlug]/settings/domains.vue')), false)
  assert.equal(existsSync(resolve(root, 'server/api/dashboard/location-preference.patch.ts')), false)
  assert.equal(existsSync(resolve(root, 'server/api/dashboard/[...path].ts')), false)
  assert.equal(existsSync(resolve(root, 'server/api/dashboard/editor/menus.get.ts')), false)
  assert.equal(existsSync(resolve(root, 'server/api/dashboard/site.post.ts')), false)
  assert.equal(existsSync(resolve(root, 'server/api/dashboard/site/validate-subdomain.post.ts')), false)
  assert.equal(existsSync(resolve(root, 'server/api/sites/validate-subdomain.post.ts')), true)
})

test('admin impersonation uses Better Auth APIs without custom proxy routes', () => {
  const clientsPage = source('pages/admin/clients.vue')
  const usersPage = source('pages/admin/users.vue')
  const clientsRoute = source('server/api/admin/clients.get.ts')

  assert.equal(existsSync(resolve(root, 'server/api/admin/impersonation/start.post.ts')), false)
  assert.equal(existsSync(resolve(root, 'server/api/admin/impersonation/stop.post.ts')), false)
  assert.match(usersPage, /authClient\.admin\.impersonateUser/)
  assert.match(clientsPage, /authClient\.admin\.impersonateUser/)
  assert.match(source('layouts/dashboard.vue'), /authClient\.admin\.stopImpersonating/)
  assert.match(clientsRoute, /impersonation_user_id/)
  assert.doesNotMatch(clientsPage, /:to="`\/dashboard\/\$\{client\.org_slug\}/)

  const files = [
    ...collectSourceFiles(resolve(root, 'layouts')),
    ...collectSourceFiles(resolve(root, 'pages')),
    ...collectSourceFiles(resolve(root, 'components')),
    ...collectSourceFiles(resolve(root, 'composables')),
    ...collectSourceFiles(resolve(root, 'server')),
  ]
  for (const file of files) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /\/api\/admin\/impersonation\/(?:start|stop)/,
      `${file} still references the deleted custom impersonation proxy`,
    )
  }
})

test('admin clients uses the organization billing projection for plan state', () => {
  const clientsRoute = source('server/api/admin/clients.get.ts')

  assert.match(clientsRoute, /COALESCE\(ob\.plan, 'free'\) AS plan/)
  assert.match(clientsRoute, /ob\.status AS subscription_status/)
  assert.match(clientsRoute, /ob\.current_period_end/)
  assert.match(clientsRoute, /WHERE COALESCE\(ob\.plan, 'free'\) = 'growth'/)
  assert.doesNotMatch(clientsRoute, /COALESCE\(sb\.plan, s\.plan/)
  assert.doesNotMatch(clientsRoute, /LEFT JOIN site_billing sb/)
})

test('admin overview lists the full hierarchy without drill-down routes', () => {
  const overviewPage = source('pages/admin/index.vue')
  assert.match(overviewPage, /organization\.sites/)
  assert.match(overviewPage, /site\.locations/)
  assert.doesNotMatch(overviewPage, /\/admin\/organizations\//)
  assert.equal(existsSync(resolve(root, 'pages/admin/organizations')), false)
  assert.equal(existsSync(resolve(root, 'server/api/admin/portfolio')), false)
})

test('dashboard context and location navigation never infer residual selections', () => {
  const context = source('server/utils/dashboard-context.ts')
  const contextRoute = source('server/api/dashboard/context.get.ts')
  const locations = source('composables/useDashboardLocation.ts')
  assert.doesNotMatch(context, /resolveSingleOrgSite|resolveSelectedDashboardLocation/)
  assert.doesNotMatch(contextRoute, /selectedLocation/)
  assert.doesNotMatch(locations, /route\.path|localStorage|preference/i)
})

test('dashboard callers do not use removed editor, ai, or site aliases', () => {
  const files = [
    ...collectSourceFiles(resolve(root, 'layouts')),
    ...collectSourceFiles(resolve(root, 'pages')),
    ...collectSourceFiles(resolve(root, 'components')),
    ...collectSourceFiles(resolve(root, 'composables')),
    ...collectSourceFiles(resolve(root, 'server/utils')),
  ]

  for (const file of files) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /\/api\/dashboard\/(?:editor|ai|site)(?:\/|['"`])/,
      `${file} still uses a removed dashboard API alias`,
    )
  }
})

test('dashboard page capability keys are all guardable registry manager keys', () => {
  const guardable = new Set(allGuardableManagerKeys())
  const pages = collectSourceFiles(resolve(root, 'pages/dashboard'))
  for (const page of pages) {
    const body = readFileSync(page, 'utf8')
    const matches = body.matchAll(/cmsCapabilityKey:\s*['"]([^'"]+)['"]/g)
    for (const match of matches) {
      assert.ok(guardable.has(match[1]!), `${page} uses unguardable cmsCapabilityKey ${match[1]}`)
    }
  }
})

test('dashboard layout keeps content managers out of the primary navigation', () => {
  const layout = source('layouts/dashboard.vue')
  assert.match(layout, /return \[mobileNavItems\.value\.map/)
  assert.doesNotMatch(layout, /mobileRevenueItem|firstLocationManagerItem/)
})

test('responsive dashboard navigation keeps one canonical desktop sidebar and one five-slot shape', () => {
  const layout = source('layouts/dashboard.vue')
  assert.equal((layout.match(/^\s*<UDashboardSidebar\b/gm) ?? []).length, 1)
  assert.match(layout, /data-testid="dashboard-mobile-nav"/)
  assert.match(layout, /mobileNavItems/)
  assert.match(layout, /<DashboardAccountMenu mobile-only \/>/)
  assert.match(layout, /mobileNavItems\.length && !isAccountRoute/)
  assert.doesNotMatch(layout, /mobileMoreItems|dashboard-mobile-more|mobileRevenueItem/)
})

test('account surfaces use the mobile index and row-based account design', () => {
  const menu = source('lib/components/workspace/dashboard/DashboardAccountMenu.vue')
  const profile = source('pages/dashboard/account/profile.vue')
  const authentication = source('pages/dashboard/account/authentication.vue')
  const billing = source('pages/dashboard/account/billing-items.vue')

  assert.match(menu, /label: 'Profile'/)
  assert.match(menu, /mobileOnly/)
  assert.match(menu, /<UModal/)
  assert.match(menu, /v-model:open="mobileOpen"/)
  assert.doesNotMatch(menu, /role="dialog"/)
  assert.match(profile, /editingRow/)
  assert.match(profile, /class="profile-row/)
  assert.doesNotMatch(authentication, /<UCard/)
  assert.doesNotMatch(billing, /<UCard/)
})

test('mobile account avatar opens the shared sheet from the bottom nav and moves to the header on account pages', () => {
  const layout = source('layouts/dashboard.vue')
  assert.match(layout, /<DashboardAccountMenu mobile-only \/>/)
  assert.doesNotMatch(layout, /<NuxtLink :to="accountIndexTo"/)
  assert.doesNotMatch(source('pages/dashboard/[orgSlug]/sites/[siteSlug]/index.vue'), /DashboardAccountMenu/)
  for (const page of ['index.vue', 'profile.vue', 'authentication.vue', 'billing-items.vue']) {
    assert.match(source(`pages/dashboard/account/${page}`), /<DashboardAccountMenu mobile-only class="md:hidden" \/>/)
  }
})

test('organization, site, and location navigation share the requested item order', () => {
  const layout = source('layouts/dashboard.vue')
  const labels = ['Today', 'Calendar', 'Sites', 'Inbox']
  let previousIndex = -1

  for (const label of labels) {
    const index = layout.indexOf(`label: '${label}'`)
    assert.ok(index > previousIndex, `${label} appears in organization navigation order`)
    previousIndex = index
  }

  assert.match(layout, /label: isOrganization \? 'Sites' : locationsNavLabel\.value/)
  assert.match(layout, /label: 'Today'.*to: `\$\{orgBase\.value\}\/today`/)
  assert.match(layout, /label: 'Calendar'.*to: `\$\{orgBase\.value\}\/calendar`/)
  assert.doesNotMatch(layout, /label: 'Menu'.*orgBase/)
})

test('organization switcher routes directly to canonical org slugs', () => {
  const layout = source('layouts/dashboard.vue')
  assert.match(layout, /`\/dashboard\/\$\{encodeURIComponent\(org\.slug\)\}`/)
  assert.doesNotMatch(layout, /switchOrganization/)
  assert.doesNotMatch(layout, /setActive\?\.\(\{ organizationId/)
  assert.doesNotMatch(layout, /navigateTo\('\/dashboard'\)/)
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

test('site overview is a preview-only edit index with pages, settings, and view-site access', () => {
  const page = source('pages/dashboard/[orgSlug]/sites/[siteSlug]/index.vue')
  const settings = source('lib/components/workspace/settings/SiteSettingsPage.vue')
  assert.match(page, /My site/)
  assert.match(page, /Site tour/)
  assert.match(page, /Media library/)
  assert.match(page, /View site/)
  assert.match(page, /activeTab === 'site'/)
  assert.doesNotMatch(page, /UChatPrompt|Recent Activity|map_embed_url/)
  assert.match(settings, /saveSiteSettings\('brand'\)/)
  assert.match(settings, /saveSiteSettings\('business'\)/)
  assert.match(settings, /saveSiteSettings\('analytics'\)/)
  assert.doesNotMatch(settings, /Business modules|URL structure|Footer tagline|Facebook URL|SEO title|SEO description/)
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
