import test from 'node:test'
import assert from 'node:assert/strict'

import { formatBookingPolicySummary, type BookingPolicySummarySource } from '../../server/utils/booking-policy-summary.ts'

function reservationPolicy(overrides: Partial<BookingPolicySummarySource> = {}): BookingPolicySummarySource {
  return {
    policy_type: 'reservation',
    booking_window_days: null,
    advance_notice_minutes: null,
    free_cancellation_until_minutes: 120,
    late_arrival_grace_minutes: 15,
    host_confirmation_sla_minutes: 60,
    reschedule_allowed: true,
    reschedule_cutoff_minutes: 120,
    deposit_required: true,
    deposit_trigger_party_size: 6,
    special_requests_allowed: true,
    weather_policy: null,
    minimum_guest_age: null,
    accessibility_contact_required: false,
    additional_notes_html: '<p>Call us if you are running late.</p>',
    ...overrides,
  }
}

test('renderBookingPolicySummary returns ordered reservation policy items', () => {
  const summary = formatBookingPolicySummary(reservationPolicy(), 'en')
  assert.equal(summary.heading, 'Reservation policies')
  assert.equal(summary.items[0]?.id, 'host_confirmation_sla')
  assert(summary.items.some((item) => item.text.includes('2 hours')))
  assert(summary.items.some((item) => item.text.includes('6+')))
  assert.equal(summary.additional_notes_html, '<p>Call us if you are running late.</p>')
})

test('renderBookingPolicySummary localizes Thai summaries', () => {
  const summary = formatBookingPolicySummary(reservationPolicy(), 'th')
  assert.equal(summary.heading, 'นโยบายการจอง')
  assert(summary.items.some((item) => item.text.includes('2 ชั่วโมง')))
})
