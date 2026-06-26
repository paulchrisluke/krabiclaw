import type { Plan } from '~/server/api/billing/plans.get'

export type { Plan, PlanPrice, PlanLimits } from '~/server/api/billing/plans.get'

export const usePlans = () => {
  const nuxtApp = useNuxtApp()
  const { data, status, error } = useAsyncData<Plan[]>('billing-plans', () => $fetch<Plan[]>('/api/billing/plans'), {
    server: true,
    getCachedData(key) {
      return nuxtApp.payload.data[key] as Plan[] | undefined
    },
  })

  const plans = computed(() => data.value ?? null)
  const freePlan = computed(() => plans.value?.find(p => p.id === 'free') ?? null)
  const growthPlan = computed(() => plans.value?.find(p => p.id === 'growth') ?? null)
  const managedPlan = computed(() => plans.value?.find(p => p.id === 'managed') ?? null)
  const seoAcceleratorPlan = computed(() => plans.value?.find(p => p.id === 'seo_accelerator') ?? null)

  function monthlyPrice(plan: Plan): number | null {
    return plan.prices.find(p => p.interval === 'month')?.amount ?? null
  }

  function annualPrice(plan: Plan): number | null {
    return plan.prices.find(p => p.interval === 'year')?.amount ?? null
  }

  function formatPrice(cents: number): string {
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  function displayPrice(plan: Plan, annual: boolean): string {
    if (plan.prices.length === 0) return '$0'
    if (annual) {
      const cents = annualPrice(plan)
      return cents !== null ? formatPrice(cents) : '$0'
    }
    const cents = monthlyPrice(plan)
    return cents !== null ? formatPrice(cents) : '$0'
  }

  return { plans, freePlan, growthPlan, managedPlan, seoAcceleratorPlan, monthlyPrice, annualPrice, formatPrice, displayPrice, status, error }
}
