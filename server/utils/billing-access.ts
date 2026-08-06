export const PAST_DUE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

export interface SubscriptionAccessInput {
  plan: string | null | undefined
  status: string | null | undefined
  paymentStatus: string | null | undefined
  periodEnd?: Date | string | number | null
  paidThrough?: Date | string | number | null
  pastDueSince?: Date | string | number | null
}

function periodEndMs(value: SubscriptionAccessInput['periodEnd']): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  if (typeof value === 'number') {
    const milliseconds = Math.abs(value) >= 100_000_000_000 ? value : value * 1000
    return Number.isFinite(milliseconds) ? milliseconds : null
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

/**
 * Returns the plan whose entitlements may be used at this moment. The
 * original Stripe/Better Auth plan remains stored separately for billing
 * history; access is derived from subscription state.
 */
export function getEffectiveAccessPlan(
  input: SubscriptionAccessInput,
  now = new Date(),
): string {
  const plan = input.plan?.trim()
  if (!plan) return 'free'
  if (input.status === 'trialing') return plan
  if (input.status === 'active' && input.paymentStatus === 'paid') {
    const paidThrough = periodEndMs(input.paidThrough)
    if (paidThrough === null || now.getTime() > paidThrough) return 'free'
    return plan
  }

  if (input.status === 'past_due') {
    const graceAnchor = periodEndMs(input.paidThrough) ?? periodEndMs(input.pastDueSince)
    if (graceAnchor !== null && now.getTime() <= graceAnchor + PAST_DUE_GRACE_PERIOD_MS) return plan
  }

  return 'free'
}
