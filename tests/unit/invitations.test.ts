import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildInvitationRedirectUrl,
  isPhoneInvitationEmail,
  phoneDigitsFromInvitationEmail,
  sanitizeInvitationReturnTo,
} from '../../server/utils/invitations.ts'
import { pickPrimaryInvitationScope } from '../../server/utils/whatsapp-access.ts'

test('isPhoneInvitationEmail recognizes the deterministic WhatsApp temp-email pattern', () => {
  assert.equal(isPhoneInvitationEmail('phone-66812345678@phone.krabiclaw.local'), true)
  assert.equal(isPhoneInvitationEmail('owner@example.com'), false)
  assert.equal(isPhoneInvitationEmail('phone-abc@phone.krabiclaw.local'), false)
})

test('phoneDigitsFromInvitationEmail recovers the encoded digits, or null for non-phone invites', () => {
  assert.equal(phoneDigitsFromInvitationEmail('phone-66812345678@phone.krabiclaw.local'), '66812345678')
  assert.equal(phoneDigitsFromInvitationEmail('owner@example.com'), null)
})

test('sanitizeInvitationReturnTo only accepts a same-org, root-relative dashboard path', () => {
  assert.equal(sanitizeInvitationReturnTo('/dashboard/pottery-house/sites/main/inbox?thread=abc', 'pottery-house'), '/dashboard/pottery-house/sites/main/inbox?thread=abc')
  assert.equal(sanitizeInvitationReturnTo('/dashboard/pottery-house', 'pottery-house'), '/dashboard/pottery-house')
  // Wrong org scope.
  assert.equal(sanitizeInvitationReturnTo('/dashboard/other-org/sites/main', 'pottery-house'), null)
  // Open-redirect attempts.
  assert.equal(sanitizeInvitationReturnTo('//evil.com/dashboard/pottery-house', 'pottery-house'), null)
  assert.equal(sanitizeInvitationReturnTo('https://evil.com/dashboard/pottery-house', 'pottery-house'), null)
  assert.equal(sanitizeInvitationReturnTo('/dashboard/pottery-house\\@evil.com', 'pottery-house'), null)
  assert.equal(sanitizeInvitationReturnTo(undefined, 'pottery-house'), null)
  assert.equal(sanitizeInvitationReturnTo('', 'pottery-house'), null)
  // Dot-segment traversal that resolves outside the invited organization
  // after normalization, even though the raw string starts with orgBase.
  assert.equal(sanitizeInvitationReturnTo('/dashboard/pottery-house/../other-org/settings', 'pottery-house'), null)
  // Percent-encoded traversal ("%2e%2e" decodes to "..") must be normalized
  // before the same-org check, not evaluated as a literal string prefix.
  assert.equal(sanitizeInvitationReturnTo('/dashboard/pottery-house/%2e%2e/other-org/settings', 'pottery-house'), null)
})

test('buildInvitationRedirectUrl sends non-active sites through onboarding', () => {
  assert.equal(
    buildInvitationRedirectUrl({
      orgSlug: 'pottery-house',
      preferredSite: { id: 's1', subdomain: 'pottery-house', onboarding_status: 'pending' },
      fallbackSites: [],
    }),
    '/dashboard/pottery-house/~/onboarding',
  )
})

test('buildInvitationRedirectUrl lands on the single active site when none is preferred', () => {
  assert.equal(
    buildInvitationRedirectUrl({
      orgSlug: 'pottery-house',
      preferredSite: null,
      fallbackSites: [{ id: 's1', subdomain: 'pottery-house', onboarding_status: 'active' }],
    }),
    '/dashboard/pottery-house/sites/pottery-house',
  )
})

test('buildInvitationRedirectUrl falls back to the org root for multi-site orgs with no preference', () => {
  assert.equal(
    buildInvitationRedirectUrl({
      orgSlug: 'acme',
      preferredSite: null,
      fallbackSites: [
        { id: 's1', subdomain: 'a', onboarding_status: 'active' },
        { id: 's2', subdomain: 'b', onboarding_status: 'active' },
      ],
    }),
    '/dashboard/acme',
  )
})

test('pickPrimaryInvitationScope prefers a site-wide scope over a location-specific one', () => {
  assert.deepEqual(
    pickPrimaryInvitationScope([
      { site_id: 'site-1', location_id: 'loc-1' },
      { site_id: 'site-1', location_id: null },
    ]),
    { site_id: 'site-1', location_id: null },
  )
  assert.deepEqual(
    pickPrimaryInvitationScope([{ site_id: 'site-1', location_id: 'loc-1' }]),
    { site_id: 'site-1', location_id: 'loc-1' },
  )
  assert.equal(pickPrimaryInvitationScope([]), null)
})
