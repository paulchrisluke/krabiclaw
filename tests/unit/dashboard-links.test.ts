import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDashboardUrl, DASHBOARD_DESTINATIONS, type DashboardDestination } from '../../server/utils/dashboard-links.ts'

const orgContext = {
  env: { NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://krabiclaw.com' },
  organizationId: 'org_123',
  organizationSlug: 'pottery-house',
  subdomain: 'pottery-house-site',
  locationSlug: 'ao-nang',
}

// Each destination's expected URL is verified against its real page route.
// No synthetic scope segment exists in the canonical dashboard hierarchy.
const EXPECTED_URLS: Record<DashboardDestination, string> = {
  'settings.general': 'https://krabiclaw.com/dashboard/pottery-house/settings/general',
  'settings.domains': 'https://krabiclaw.com/dashboard/pottery-house/settings/domains',
  'settings.analytics': 'https://krabiclaw.com/dashboard/pottery-house/settings/analytics',
  'settings.billing': 'https://krabiclaw.com/dashboard/pottery-house/settings/billing',
  'settings.members': 'https://krabiclaw.com/dashboard/pottery-house/settings/members',
  'settings.chatgpt': 'https://krabiclaw.com/dashboard/pottery-house/settings/chatgpt',
  'site.overview': 'https://krabiclaw.com/dashboard/pottery-house/sites/pottery-house-site',
  'site.locations': 'https://krabiclaw.com/dashboard/pottery-house/sites/pottery-house-site/locations',
  'site.locations.new': 'https://krabiclaw.com/dashboard/pottery-house/sites/pottery-house-site/locations/new',
  'site.settings': 'https://krabiclaw.com/dashboard/pottery-house/sites/pottery-house-site/settings',
  'location.overview': 'https://krabiclaw.com/dashboard/pottery-house/sites/pottery-house-site/locations/ao-nang',
  'location.settings': 'https://krabiclaw.com/dashboard/pottery-house/sites/pottery-house-site/locations/ao-nang/settings',
  support: 'https://krabiclaw.com/dashboard/pottery-house/support',
}

test('buildDashboardUrl produces the exact literal URL for every DASHBOARD_DESTINATIONS entry', () => {
  for (const destination of Object.keys(DASHBOARD_DESTINATIONS) as DashboardDestination[]) {
    const url = buildDashboardUrl(orgContext, destination)
    assert.equal(url, EXPECTED_URLS[destination], `mismatch for destination "${destination}"`)
  }
})

test('no settings.* destination reintroduces the removed ~/ route segment', () => {
  for (const destination of Object.keys(DASHBOARD_DESTINATIONS) as DashboardDestination[]) {
    if (!destination.startsWith('settings.')) continue
    const url = buildDashboardUrl(orgContext, destination)
    assert.doesNotMatch(
      url,
      /\/dashboard\/pottery-house\/~\//,
      `"${destination}" reintroduced the removed ~/ segment, producing a 404 URL: ${url}`,
    )
  }
})

test('DASHBOARD_DESTINATIONS has no untested entries (fails loudly if a destination is added without test coverage)', () => {
  const registryKeys = Object.keys(DASHBOARD_DESTINATIONS).sort()
  const expectedKeys = Object.keys(EXPECTED_URLS).sort()
  assert.deepEqual(registryKeys, expectedKeys)
})

test('buildDashboardUrl falls back to organizationId when organizationSlug is missing', () => {
  const url = buildDashboardUrl(
    { env: { NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://krabiclaw.com' }, organizationId: 'org_123' },
    'settings.domains',
  )
  assert.equal(url, 'https://krabiclaw.com/dashboard/org_123/settings/domains')
})

test('buildDashboardUrl falls back to the default platform domain when env is unset', () => {
  const url = buildDashboardUrl({ env: {}, organizationId: 'org_123' }, 'settings.domains')
  assert.equal(url, 'https://krabiclaw.com/dashboard/org_123/settings/domains')
})
