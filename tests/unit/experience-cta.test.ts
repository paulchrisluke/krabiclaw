import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildExperienceContactUrl,
  resolveExperienceAvailabilityMessage,
  resolveExperienceDetailCta,
} from '../../utils/experience-cta.ts'

const baseInput = {
  bookLabel: 'Reserve Now',
  contactLabel: 'Contact Us',
  contactUrl: '/contact?experienceId=exp-membership&experienceTitle=Monthly+Membership',
}

test('experience detail CTA resolver owns the bookable and inquiry-only hierarchy', () => {
  assert.deepEqual(
    resolveExperienceDetailCta({ ...baseInput, availabilityState: 'available' }),
    { action: 'book', label: 'Reserve Now' },
  )
  assert.deepEqual(
    resolveExperienceDetailCta({ ...baseInput, availabilityState: 'limited' }),
    { action: 'book', label: 'Reserve Now' },
  )
  assert.deepEqual(
    resolveExperienceDetailCta({ ...baseInput, availabilityState: 'inquiry_only' }),
    { action: 'contact', label: 'Contact Us', to: baseInput.contactUrl },
  )
})

test('sold-out, full, no-slot, and closed experiences do not expose a primary CTA', () => {
  for (const input of [
    { status: 'sold_out' },
    { availabilityState: 'sold_out' },
    { availabilityState: 'full' },
    { availabilityState: 'no_slots' },
    { locationClosed: true, availabilityState: 'available' },
  ]) {
    assert.equal(resolveExperienceDetailCta({ ...baseInput, ...input }), null)
  }
})

test('availability messages use the canonical localized labels supplied by the caller', () => {
  const labels = {
    fullyBooked: 'Fully booked',
    notScheduled: 'Not currently scheduled',
    temporarilyUnavailable: 'Temporarily unavailable',
  }
  assert.equal(resolveExperienceAvailabilityMessage('full', labels), 'Fully booked')
  assert.equal(resolveExperienceAvailabilityMessage('no_slots', labels), 'Not currently scheduled')
  assert.equal(resolveExperienceAvailabilityMessage('temporarily_unavailable', labels), 'Temporarily unavailable')
  assert.equal(resolveExperienceAvailabilityMessage('inquiry_only', labels), null)
})

test('inquiry contact URL preserves the current experience context', () => {
  assert.equal(
    buildExperienceContactUrl('exp-membership', 'Monthly Studio Membership'),
    '/contact?experienceId=exp-membership&experienceTitle=Monthly+Studio+Membership',
  )
  assert.equal(buildExperienceContactUrl(null, 'Missing ID'), '/contact')
})
