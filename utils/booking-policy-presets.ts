import type { BookingPolicyPatch } from '~/server/utils/booking-policies'

/**
 * Cancellation terms as named outcomes rather than a minutes field.
 *
 * The stored policy is still numeric — this is the presentation mapping over
 * it. A tenant deciding "how late can someone cancel" is choosing between a few
 * real positions, not authoring a number, and a free-form minutes box lets them
 * build terms no guest can reason about (and that no two experiences share).
 */
export interface BookingPolicyPreset {
  id: string
  label: string
  /** What actually happens, in the guest's terms. One line per consequence. */
  terms: readonly string[]
  freeCancellationUntilMinutes: number
  rescheduleAllowed: boolean
  rescheduleCutoffMinutes: number | null
}

const DAY = 60 * 24

export const BOOKING_POLICY_PRESETS: readonly BookingPolicyPreset[] = [
  {
    id: 'flexible',
    label: 'Flexible',
    terms: [
      'Free cancellation up to 24 hours before the start',
      'Guests can reschedule up to 24 hours before',
    ],
    freeCancellationUntilMinutes: DAY,
    rescheduleAllowed: true,
    rescheduleCutoffMinutes: DAY,
  },
  {
    id: 'moderate',
    label: 'Moderate',
    terms: [
      'Free cancellation up to 3 days before the start',
      'Guests can reschedule up to 3 days before',
    ],
    freeCancellationUntilMinutes: 3 * DAY,
    rescheduleAllowed: true,
    rescheduleCutoffMinutes: 3 * DAY,
  },
  {
    id: 'firm',
    label: 'Firm',
    terms: [
      'Free cancellation up to 7 days before the start',
      'Guests can reschedule up to 7 days before',
    ],
    freeCancellationUntilMinutes: 7 * DAY,
    rescheduleAllowed: true,
    rescheduleCutoffMinutes: 7 * DAY,
  },
  {
    id: 'non_refundable',
    label: 'Non-refundable',
    terms: [
      'No free cancellation once booked',
      'Guests cannot reschedule',
    ],
    freeCancellationUntilMinutes: 0,
    rescheduleAllowed: false,
    rescheduleCutoffMinutes: null,
  },
]

/**
 * Which preset a stored policy already matches, or null when it was set to
 * something else. A policy that predates the presets keeps its terms: it reads
 * as "Custom" rather than being silently rounded to the nearest one.
 */
export function matchBookingPolicyPreset(policy: BookingPolicyPatch | null | undefined): BookingPolicyPreset | null {
  if (!policy) return null
  const minutes = policy.free_cancellation_until_minutes
  if (minutes === null || minutes === undefined) return null
  return BOOKING_POLICY_PRESETS.find(preset => preset.freeCancellationUntilMinutes === minutes) ?? null
}

/** The fields a preset owns, to merge over whatever else the policy carries. */
export function applyBookingPolicyPreset(preset: BookingPolicyPreset): Partial<BookingPolicyPatch> {
  return {
    free_cancellation_until_minutes: preset.freeCancellationUntilMinutes,
    reschedule_allowed: preset.rescheduleAllowed,
    reschedule_cutoff_minutes: preset.rescheduleCutoffMinutes,
  }
}
