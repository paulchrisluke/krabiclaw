import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

interface SiteFixture {
  id: string
  vertical: string
  theme_id: string
  feature_overrides: string | null
}

interface LocationFixture {
  feature_overrides: string | null
}

const fixtures = {
  site: null as SiteFixture | null,
  location: null as LocationFixture | null,
}

async function queryFirst<T>(_db: unknown, query: string): Promise<T | null> {
  if (query.includes('FROM sites')) return fixtures.site as T | null
  if (query.includes('FROM business_locations')) return fixtures.location as T | null
  return null
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryFirst },
})

const { isDashboardRouteCapabilityAllowed } = await import('../../server/utils/dashboard-route-capability.ts')

const db = {} as D1Database
const restaurantSite: SiteFixture = { id: 'site-1', vertical: 'restaurant', theme_id: 'saya-theme-v1', feature_overrides: null }
const professionalServiceSite: SiteFixture = { id: 'site-2', vertical: 'professional_service', theme_id: 'blawby-theme-v1', feature_overrides: null }

test('a manager present in the site\'s default feature set is allowed', async () => {
  fixtures.site = restaurantSite
  fixtures.location = null
  const allowed = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'acme', siteSlug: 'acme-restaurant', capabilityKey: 'site.blog',
  })
  assert.equal(allowed, true)
})

test('a manager absent from the vertical\'s default feature set is denied', async () => {
  fixtures.site = restaurantSite
  fixtures.location = null
  const allowed = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'acme', siteSlug: 'acme-restaurant', capabilityKey: 'site.services',
  })
  assert.equal(allowed, false)
})

test('a hybrid site delta unlocks a manager the vertical does not default to', async () => {
  // 'location.experiences' is off by default for the restaurant vertical (config/cms-registry.ts
  // verticalDefaultFeatures) — assert it's denied under the site's plain defaults first, so the
  // second assertion actually proves the override changed the outcome rather than checking a key
  // that was already allowed by default either way.
  fixtures.site = restaurantSite
  fixtures.location = { feature_overrides: null }
  const deniedByDefault = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'acme', siteSlug: 'acme-restaurant', locationSlug: 'downtown', capabilityKey: 'location.experiences',
  })
  assert.equal(deniedByDefault, false)

  fixtures.site = { ...restaurantSite, feature_overrides: JSON.stringify({ enabled: ['experiences'] }) }
  const allowedAfterOverride = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'acme', siteSlug: 'acme-restaurant', locationSlug: 'downtown', capabilityKey: 'location.experiences',
  })
  assert.equal(allowedAfterOverride, true)
})

test('a location-scoped key checks the location delta, not the site', async () => {
  fixtures.site = restaurantSite
  fixtures.location = { feature_overrides: JSON.stringify({ disabled: ['menu'] }) }
  const denied = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'acme', siteSlug: 'acme-restaurant', locationSlug: 'downtown', capabilityKey: 'location.menu',
  })
  assert.equal(denied, false)

  const allowed = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'acme', siteSlug: 'acme-restaurant', locationSlug: 'downtown', capabilityKey: 'location.reservations',
  })
  assert.equal(allowed, true)
})

test('a missing site fails closed (denied), never throws', async () => {
  fixtures.site = null
  fixtures.location = null
  const allowed = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'ghost', siteSlug: 'nonexistent', capabilityKey: 'site.blog',
  })
  assert.equal(allowed, false)
})

test('a missing location under a real site fails closed', async () => {
  fixtures.site = restaurantSite
  fixtures.location = null
  const allowed = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'acme', siteSlug: 'acme-restaurant', locationSlug: 'nonexistent', capabilityKey: 'location.menu',
  })
  assert.equal(allowed, false)
})

test('content manager keys are always allowed, even under a site delta that tries to disable them', async () => {
  fixtures.site = { ...restaurantSite, feature_overrides: JSON.stringify({ disabled: ['qa', 'blog', 'reviews'] }) }
  fixtures.location = null
  const qaAllowed = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'acme', siteSlug: 'acme-restaurant', capabilityKey: 'site.qa',
  })
  assert.equal(qaAllowed, true)
})

test('professional_service default manager key is allowed, restaurant-only key is denied', async () => {
  fixtures.site = professionalServiceSite
  fixtures.location = null
  const servicesAllowed = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'firm', siteSlug: 'firm-site', capabilityKey: 'site.services',
  })
  assert.equal(servicesAllowed, true)

  // A real location context (not omitted) so this proves 'location.menu' is denied because
  // blawby's template catalog has no manager for it at all — not merely because no location
  // was supplied and the location-lookup branch never ran.
  fixtures.location = { feature_overrides: null }
  const menuDenied = await isDashboardRouteCapabilityAllowed(db, 'user-1', {
    organizationSlug: 'firm', siteSlug: 'firm-site', locationSlug: 'downtown', capabilityKey: 'location.menu',
  })
  assert.equal(menuDenied, false)
})
