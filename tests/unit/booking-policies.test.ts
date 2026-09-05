import test from 'node:test'
import assert from 'node:assert/strict'

import { formatBookingPolicySummary, type BookingPolicySummarySource } from '../../server/utils/booking-policy-summary.ts'

function reservationPolicy(overrides: Partial<BookingPolicySummarySource> = {}): BookingPolicySummarySource {
  return {
    policy_type: 'reservation',
    advance_notice_minutes: null,
    free_cancellation_until_minutes: 120,
    reschedule_allowed: true,
    reschedule_cutoff_minutes: 120,
    deposit_required: true,
    deposit_trigger_party_size: 6,
    minimum_guest_age: null,
    accessibility_contact_required: false,
    ...overrides,
  }
}

test('renderBookingPolicySummary returns ordered reservation policy items', () => {
  const summary = formatBookingPolicySummary(reservationPolicy(), 'en')
  assert.equal(summary.heading, 'Reservation policies')
  assert.equal(summary.items[0]?.id, 'cancellation')
  assert(summary.items.some((item) => item.text.includes('2 hours')))
  assert(summary.items.some((item) => item.text.includes('6+')))
})

test('renderBookingPolicySummary localizes Thai summaries', () => {
  const summary = formatBookingPolicySummary(reservationPolicy(), 'th')
  assert.equal(summary.heading, 'นโยบายการจอง')
  assert(summary.items.some((item) => item.text.includes('2 ชั่วโมง')))
})
