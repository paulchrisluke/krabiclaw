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
  assert.equal(summary.items[0]?.id, 'cancellation')
  assert(summary.items.some((item) => item.text.includes('2 hours')))
  assert(summary.items.some((item) => item.text.includes('6+')))
  assert.equal(summary.additional_notes_html, '<p>Call us if you are running late.</p>')
})

test('a summary publishes only what a tenant can author', () => {
  // The confirmation SLA, the late-arrival grace, special requests and the
  // weather note were removed from the editor, so their stored values must stop
  // reaching guests — publishing what nobody can change is the bug this pass
  // exists to fix. The fixture still carries all four.
  const summary = formatBookingPolicySummary(reservationPolicy(), 'en')
  const ids = summary.items.map((item) => item.id)
  for (const retired of ['host_confirmation_sla', 'late_arrival', 'special_requests', 'weather_policy']) {
    assert(!ids.includes(retired), `${retired} should no longer be rendered`)
  }
  assert.deepEqual(ids, ['cancellation', 'reschedule', 'deposit'])
})

test('renderBookingPolicySummary localizes Thai summaries', () => {
  const summary = formatBookingPolicySummary(reservationPolicy(), 'th')
  assert.equal(summary.heading, 'นโยบายการจอง')
  assert(summary.items.some((item) => item.text.includes('2 ชั่วโมง')))
})
