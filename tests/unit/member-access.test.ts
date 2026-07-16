import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canAccessResource,
  canLocationManagerUseDashboardPath,
  isOrganizationWideRole,
  type MemberAccessScope,
} from '../../server/utils/member-access.ts'
import { phoneTemporaryEmail } from '../../server/utils/phone-invitations.ts'
import { buildWhatsAppTemplatePayload } from '../../server/utils/whatsapp.ts'

const scopes: MemberAccessScope[] = [
  { organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1' },
  { organizationId: 'org-1', siteId: 'site-2', locationId: null },
]

test('owner and admin retain organization-wide access', () => {
  assert.equal(isOrganizationWideRole('owner'), true)
  assert.equal(isOrganizationWideRole('admin'), true)
  assert.equal(canAccessResource('owner', [], { organizationId: 'org-1', siteId: 'site-x', locationId: 'loc-x' }), true)
})

test('location manager requires an exact location or site-wide scope', () => {
  assert.equal(canAccessResource('location_manager', scopes, { organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1' }), true)
  assert.equal(canAccessResource('location_manager', scopes, { organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-2' }), false)
  assert.equal(canAccessResource('location_manager', scopes, { organizationId: 'org-1', siteId: 'site-2', locationId: 'loc-any' }), true)
  assert.equal(canAccessResource('location_manager', scopes, { organizationId: 'org-1', siteId: 'site-3', locationId: null }), false)
})

test('ordinary members do not gain scoped operational access', () => {
  assert.equal(canAccessResource('member', scopes, { organizationId: 'org-1', siteId: 'site-2', locationId: null }), false)
})

test('location manager is limited to operational dashboard APIs', () => {
  assert.equal(canLocationManagerUseDashboardPath('/api/dashboard/reservations/abc'), true)
  assert.equal(canLocationManagerUseDashboardPath('/api/dashboard/reviews/abc/reply'), true)
  assert.equal(canLocationManagerUseDashboardPath('/api/dashboard/settings'), false)
  assert.equal(canLocationManagerUseDashboardPath('/api/dashboard/members'), false)
  assert.equal(canLocationManagerUseDashboardPath('/api/dashboard/editor/menus'), false)
})

test('phone invitations reuse the Better Auth deterministic temporary email convention', () => {
  assert.equal(phoneTemporaryEmail('+66 81 234 5678'), 'phone-66812345678@phone.krabiclaw.local')
})

test('access invitation payload matches the submitted Meta parameter order', () => {
  assert.deepEqual(buildWhatsAppTemplatePayload('dashboard_access_invitation', {
    site_name: 'Pottery House Krabi',
    invitation_path: 'invite-1?siteId=site-pottery-house',
  }), {
    name: 'dashboard_access_invitation',
    language: { code: 'en_US' },
    components: [
      { type: 'body', parameters: [{ type: 'text', text: 'Pottery House Krabi' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'invite-1?siteId=site-pottery-house' }] },
    ],
  })
})
