import type { Plan } from '~/server/api/billing/plans.get'

export type { Plan, PlanPrice, PlanLimits } from '~/server/api/billing/plans.get'

export const usePlans = () => {
  const { data, status } = useFetch<Plan[]>('/api/billing/plans', {
    key: 'billing-plans',
    default: () => [],
  })

  const plans = computed(() => data.value ?? [])
  const freePlan = computed(() => plans.value.find(p => p.id === 'free') ?? null)
  const proPlan = computed(() => plans.value.find(p => p.id === 'pro') ?? null)
  const agencyPlan = computed(() => plans.value.find(p => p.id === 'agency') ?? null)

  function monthlyPrice(plan: Plan): number | null {
    return plan.prices.find(p => p.interval === 'month')?.amount ?? null
  }

  function annualPrice(plan: Plan): number | null {
    return plan.prices.find(p => p.interval === 'year')?.amount ?? null
  }

  function formatPrice(cents: number): string {
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
  }

  function displayPrice(plan: Plan, annual: boolean): string {
    if (plan.prices.length === 0) return '$0'
    if (annual) {
      const cents = annualPrice(plan)
      return cents !== null ? formatPrice(cents) : 'N/A'
    }
    const cents = monthlyPrice(plan)
    return cents !== null ? formatPrice(cents) : '$0'
  }

  return { plans, freePlan, proPlan, agencyPlan, monthlyPrice, annualPrice, formatPrice, displayPrice, status }
}
