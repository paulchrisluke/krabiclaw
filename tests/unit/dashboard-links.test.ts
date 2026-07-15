import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDashboardUrl, DASHBOARD_DESTINATIONS, type DashboardDestination } from '../../server/utils/dashboard-links.ts'

const orgContext = {
  env: { NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://krabiclaw.com' },
  organizationId: 'org_123',
  organizationSlug: 'pottery-house',
}

// Each destination's expected URL, verified against its real page route file
// under pages/dashboard/[orgSlug]/~/... . The `~` segment is a literal route
// segment in this app's file-based routing (see pages/dashboard/[orgSlug]/~/
// vs pages/dashboard/[orgSlug]/support.vue) and must never be stripped.
const EXPECTED_URLS: Record<DashboardDestination, string> = {
  'settings.general': 'https://krabiclaw.com/dashboard/pottery-house/~/settings/general',
  'settings.domains': 'https://krabiclaw.com/dashboard/pottery-house/~/settings/domains',
  'settings.billing': 'https://krabiclaw.com/dashboard/pottery-house/~/settings/billing',
  'settings.members': 'https://krabiclaw.com/dashboard/pottery-house/~/settings/members',
  support: 'https://krabiclaw.com/dashboard/pottery-house/support',
}

test('buildDashboardUrl produces the exact literal URL for every DASHBOARD_DESTINATIONS entry', () => {
  for (const destination of Object.keys(DASHBOARD_DESTINATIONS) as DashboardDestination[]) {
    const url = buildDashboardUrl(orgContext, destination)
    assert.equal(url, EXPECTED_URLS[destination], `mismatch for destination "${destination}"`)
  }
})

test('every settings.* destination preserves the literal ~/ route segment', () => {
  for (const destination of Object.keys(DASHBOARD_DESTINATIONS) as DashboardDestination[]) {
    if (!destination.startsWith('settings.')) continue
    const url = buildDashboardUrl(orgContext, destination)
    assert.match(
      url,
      /\/dashboard\/pottery-house\/~\/settings\//,
      `expected literal ~/ segment to survive for "${destination}", got: ${url}`,
    )
    assert.doesNotMatch(
      url,
      /\/dashboard\/pottery-house\/settings\//,
      `~ segment was stripped for "${destination}", producing a 404 URL: ${url}`,
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
  assert.equal(url, 'https://krabiclaw.com/dashboard/org_123/~/settings/domains')
})

test('buildDashboardUrl falls back to the default platform domain when env is unset', () => {
  const url = buildDashboardUrl({ env: {}, organizationId: 'org_123' }, 'settings.domains')
  assert.equal(url, 'https://krabiclaw.com/dashboard/org_123/~/settings/domains')
})
