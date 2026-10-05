import { paymentDisplay, paymentRefundsDisplay, paymentOrderDisplay } from './payment-display'
import { isValidTimezone, isValidInstant } from '../utils/timezone'
import type { PaymentDisplay, PaymentRefundDisplay, PaymentOrderDisplay } from './payment-display'
import type { FormattedBookingPolicySummary } from '../server/utils/booking-policy-summary'

export type AccountActivityKind = 'booking' | 'reservation' | 'order' | 'payment'
export interface AccountActivityItem {
  kind: AccountActivityKind
  /** Visits use their request ID, or their actual operational ID when no request survives. */
  id: string
  requestId: string | null
  operationalId: string | null
  paymentId: string | null
  organizationId: string
  organizationName: string | null
  organizationSlug: string | null
  title: string
  status: string
  startsAt: string | null
  endsAt: string | null
  timeZone: string | null
  createdAt: string
  imageUrl: string | null
  locationTitle: string | null
  partySize: number | null
}
export interface AccountActivityDetail extends AccountActivityItem {
  payments: Array<{ payment: PaymentDisplay; refunds: PaymentRefundDisplay[]; order: PaymentOrderDisplay | null }>
  policy: FormattedBookingPolicySummary | null
  canCancel: boolean
  contactEmail: string | null
  contactPhone: string | null
  threadId: string | null
}
export interface AccountActivityResponse { activities: AccountActivityItem[] }
export interface AccountActivityDetailResponse { activity: AccountActivityDetail }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const nullableString = (value: unknown) => value === null || typeof value === 'string'
export function isAccountActivityKind(value: unknown): value is AccountActivityKind {
  return value === 'booking' || value === 'reservation' || value === 'order' || value === 'payment'
}
export function isAccountActivityItem(value: unknown): value is AccountActivityItem {
  return record(value) && isAccountActivityKind(value.kind) && typeof value.id === 'string'
    && typeof value.organizationId === 'string' && typeof value.title === 'string' && !!value.title.trim()
    && typeof value.status === 'string' && isValidInstant(value.createdAt)
    && ['requestId', 'operationalId', 'paymentId', 'organizationName', 'organizationSlug', 'startsAt', 'endsAt', 'timeZone', 'imageUrl', 'locationTitle'].every(key => nullableString(value[key]))
    && (value.partySize === null || (typeof value.partySize === 'number' && Number.isSafeInteger(value.partySize) && value.partySize > 0))
    && ((value.startsAt === null && value.endsAt === null && value.timeZone === null) || (isValidInstant(value.startsAt) && isValidInstant(value.endsAt) && Date.parse(value.endsAt) > Date.parse(value.startsAt) && typeof value.timeZone === 'string' && isValidTimezone(value.timeZone)))
    && (value.kind === 'payment' ? value.operationalId === null && value.paymentId === value.id : value.kind === 'order' ? value.requestId === null && value.operationalId === null && value.paymentId === value.id && value.startsAt === null && value.endsAt === null && value.timeZone === null : value.id === (value.requestId ?? value.operationalId) && typeof value.operationalId === 'string' && typeof value.startsAt === 'string' && typeof value.endsAt === 'string' && typeof value.timeZone === 'string')
}
export function isAccountActivityResponse(value: unknown): value is AccountActivityResponse {
  return record(value) && Array.isArray(value.activities) && value.activities.every(isAccountActivityItem)
}
export function isAccountActivityDetailResponse(value: unknown): value is AccountActivityDetailResponse {
  if (!record(value) || !isAccountActivityItem(value.activity) || !record(value.activity)) return false
  const activity = value.activity
  if (!Array.isArray(activity.payments)) return false
  try {
    for (const group of activity.payments) {
      if (!record(group)) return false
      paymentDisplay(group.payment)
      paymentRefundsDisplay(group.refunds)
      paymentOrderDisplay(group.order)
    }
  } catch { return false }
  return (activity.policy === null || (record(activity.policy) && typeof activity.policy.heading === 'string' && Array.isArray(activity.policy.items) && activity.policy.items.every(item => record(item) && typeof item.id === 'string' && typeof item.text === 'string') && nullableString(activity.policy.additional_notes_html)))
    && typeof activity.canCancel === 'boolean' && nullableString(activity.contactEmail) && nullableString(activity.contactPhone) && nullableString(activity.threadId)
}

export function isAccountActivityPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/dashboard\/account\/activity\/(booking|reservation|order|payment)\/[^/?#]+$/u.test(value)
}
