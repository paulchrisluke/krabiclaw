/**
 * Canonical billing-plan policy shared by server loaders and client billing
 * callers. Stripe may retain products for plans that are no longer sold; those
 * catalog records are not runtime billing identities or entitlement sources.
 */

export const STARTER_PLAN_ID = 'free' as const
export const NEW_SALE_PLAN_ID = 'growth' as const

/** Paid plans that may be purchased or attached to a new handoff. */
export const NEW_SALE_PAID_PLAN_IDS = Object.freeze([NEW_SALE_PLAN_ID] as const)

/** Recurring plan identities accepted by runtime billing projections. */
export const KNOWN_RECURRING_PLAN_IDS = Object.freeze([
  NEW_SALE_PLAN_ID,
] as const)

export type StarterPlanId = typeof STARTER_PLAN_ID
export type NewSalePlanId = typeof NEW_SALE_PAID_PLAN_IDS[number]
export type KnownRecurringPlanId = typeof KNOWN_RECURRING_PLAN_IDS[number]
export type BillingPlanId = StarterPlanId | KnownRecurringPlanId

/**
 * A serializable view for consumers that need to render or test the policy
 * without duplicating its arrays. The arrays are readonly so callers cannot
 * mutate the process-wide policy.
 */
export const BILLING_PLAN_POLICY = Object.freeze({
  starter: STARTER_PLAN_ID,
  newSalePaid: NEW_SALE_PAID_PLAN_IDS,
  knownRecurring: KNOWN_RECURRING_PLAN_IDS,
})

export function normalizeBillingPlanId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

export function isKnownBillingPlan(value: unknown): value is BillingPlanId {
  return value === STARTER_PLAN_ID || isKnownRecurringPlan(value)
}

export function isKnownRecurringPlan(value: unknown): value is KnownRecurringPlanId {
  return typeof value === 'string'
    && (KNOWN_RECURRING_PLAN_IDS as readonly string[]).includes(value)
}

export function isNewSalePlan(value: unknown): value is NewSalePlanId {
  return typeof value === 'string'
    && (NEW_SALE_PAID_PLAN_IDS as readonly string[]).includes(value)
}

/**
 * Validate a paid plan used by a new sale, checkout, or ownership handoff.
 * Starter is intentionally not accepted here because it has no subscription;
 * callers that support cancellation/free state should handle `free` explicitly.
 */
export function assertNewSalePlan(value: unknown): NewSalePlanId {
  const normalized = normalizeBillingPlanId(value)
  if (isNewSalePlan(normalized)) return normalized
  throw new Error(`Unknown paid plan "${normalized ?? String(value)}"`)
}

/**
 * Return a normalized new-sale plan, or null for free/unknown input.
 * This is useful for UI filtering where throwing would be unnecessarily noisy.
 */
export function getNewSalePlan(value: unknown): NewSalePlanId | null {
  const normalized = normalizeBillingPlanId(value)
  return isNewSalePlan(normalized) ? normalized : null
}
