import test from 'node:test'
import assert from 'node:assert/strict'

import { compareWhatsAppDeliveryStatus } from '../../server/utils/whatsapp.ts'

test('null current status always advances', () => {
  assert.equal(compareWhatsAppDeliveryStatus(null, 'accepted'), true)
  assert.equal(compareWhatsAppDeliveryStatus(null, 'sent'), true)
  assert.equal(compareWhatsAppDeliveryStatus(null, 'delivered'), true)
  assert.equal(compareWhatsAppDeliveryStatus(null, 'read'), true)
  assert.equal(compareWhatsAppDeliveryStatus(null, 'failed'), true)
})

test('forward progress through the normal lifecycle advances', () => {
  assert.equal(compareWhatsAppDeliveryStatus('accepted', 'sent'), true)
  assert.equal(compareWhatsAppDeliveryStatus('sent', 'delivered'), true)
  assert.equal(compareWhatsAppDeliveryStatus('delivered', 'read'), true)
  assert.equal(compareWhatsAppDeliveryStatus('accepted', 'read'), true)
})

test('same-status replay does not advance (idempotent no-op)', () => {
  assert.equal(compareWhatsAppDeliveryStatus('accepted', 'accepted'), false)
  assert.equal(compareWhatsAppDeliveryStatus('sent', 'sent'), false)
  assert.equal(compareWhatsAppDeliveryStatus('delivered', 'delivered'), false)
  assert.equal(compareWhatsAppDeliveryStatus('read', 'read'), false)
})

test('out-of-order regression to an earlier stage does not advance', () => {
  assert.equal(compareWhatsAppDeliveryStatus('delivered', 'sent'), false)
  assert.equal(compareWhatsAppDeliveryStatus('read', 'delivered'), false)
  assert.equal(compareWhatsAppDeliveryStatus('read', 'accepted'), false)
})

test('failed after delivered/read does not clobber the recorded success', () => {
  assert.equal(compareWhatsAppDeliveryStatus('delivered', 'failed'), false)
  assert.equal(compareWhatsAppDeliveryStatus('read', 'failed'), false)
})

test('failed is recorded when no later success stage is present', () => {
  assert.equal(compareWhatsAppDeliveryStatus('accepted', 'failed'), true)
  assert.equal(compareWhatsAppDeliveryStatus('sent', 'failed'), true)
})

test('failed is terminal: nothing overwrites an already-recorded failure', () => {
  assert.equal(compareWhatsAppDeliveryStatus('failed', 'sent'), false)
  assert.equal(compareWhatsAppDeliveryStatus('failed', 'delivered'), false)
  assert.equal(compareWhatsAppDeliveryStatus('failed', 'read'), false)
  assert.equal(compareWhatsAppDeliveryStatus('failed', 'accepted'), false)
})

test('failed replay against failed is a harmless idempotent no-op', () => {
  assert.equal(compareWhatsAppDeliveryStatus('failed', 'failed'), true)
})
