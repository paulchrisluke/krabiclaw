import test from 'node:test'
import assert from 'node:assert/strict'

import { isWhatsAppInboxDeepLinkPath } from '../../utils/dashboard-reauth.ts'

test('isWhatsAppInboxDeepLinkPath matches the WhatsApp-notification guest-thread inbox route', () => {
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house/sites/main/inbox'), true)
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house/sites/main/inbox/'), true)
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house/sites/main/locations/downtown/inbox'), true)
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house/sites/main/locations/downtown/inbox/'), true)
})

test('isWhatsAppInboxDeepLinkPath rejects other dashboard routes', () => {
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house'), false)
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house/sites/main'), false)
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house/sites/main/locations/downtown'), false)
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house/settings/members'), false)
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house/sites/main/locations/downtown/reservations'), false)
  // Legacy shape (pre-#316 location routes had no /locations/ segment) must
  // no longer match — the real route always has it now.
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboard/pottery-house/sites/main/downtown/inbox'), false)
})

test('isWhatsAppInboxDeepLinkPath rejects non-dashboard and malformed paths', () => {
  assert.equal(isWhatsAppInboxDeepLinkPath('/login'), false)
  assert.equal(isWhatsAppInboxDeepLinkPath('/dashboardinbox'), false)
  assert.equal(isWhatsAppInboxDeepLinkPath(''), false)
})
