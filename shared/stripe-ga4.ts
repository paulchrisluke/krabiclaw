export const STRIPE_GA4_PURCHASE_TYPES = [
  'initial_subscription',
  'subscription_renewal',
  'upgrade',
  'downgrade',
] as const

export type StripeGa4PurchaseType = typeof STRIPE_GA4_PURCHASE_TYPES[number]
export type StripeGa4IntentAction = Exclude<StripeGa4PurchaseType, 'subscription_renewal'>

const PLAN_RANK: Record<string, number> = {
  free: 0,
  growth: 1,
  managed: 2,
  seo_accelerator: 3,
}

export function classifyStripePlanChange(
  currentPlan: string | null | undefined,
  nextPlan: string,
  hasSubscription: boolean,
): StripeGa4IntentAction | null {
  const normalizedNext = nextPlan.trim().toLowerCase()
  if (!hasSubscription && (!currentPlan || currentPlan.trim().toLowerCase() === 'free')) {
    return 'initial_subscription'
  }

  const normalizedCurrent = currentPlan?.trim().toLowerCase() || 'free'
  if (normalizedCurrent === normalizedNext) return null

  const currentRank = PLAN_RANK[normalizedCurrent]
  const nextRank = PLAN_RANK[normalizedNext]
  if (typeof currentRank !== 'number' || typeof nextRank !== 'number') return null
  return nextRank > currentRank ? 'upgrade' : 'downgrade'
}

export function isStripeGa4PurchaseType(value: unknown): value is StripeGa4PurchaseType {
  return typeof value === 'string'
    && (STRIPE_GA4_PURCHASE_TYPES as readonly string[]).includes(value)
}

export function isStripeGa4IntentAction(value: unknown): value is StripeGa4IntentAction {
  return value === 'initial_subscription' || value === 'upgrade' || value === 'downgrade'
}
