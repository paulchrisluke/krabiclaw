import type { Plan } from '~/server/api/billing/plans.get'
import { NEW_SALE_PLAN_ID, STARTER_PLAN_ID } from '~/shared/billing-model'

export type { Plan, PlanPrice, PlanLimits } from '~/server/api/billing/plans.get'

export const usePlans = () => {
  const nuxtApp = useNuxtApp()
  const requestEvent = useRequestEvent()
  const { data, status, error } = useAsyncData<Plan[]>('billing-plans', async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request event not available' })
      const [{ cloudflareEnv }, { getCachedPlans }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/billing-plans'),
      ])
      return await getCachedPlans(cloudflareEnv(requestEvent))
    }
    return await applicationFetch<Plan[]>('/api/billing/plans', {
      validate: validateApiArrayItems<Plan>({
        id: 'string',
        name: 'string',
        tagline: 'string',
        highlighted: 'boolean',
        prices: 'array',
        features: 'array',
        limits: 'object',
        cta: {
          label: 'string',
          href: 'string',
        },
      }),
    })
  }, {
    server: true,
    getCachedData(key) {
      return nuxtApp.payload.data[key] as Plan[] | undefined
    },
  })

  if (error.value) throw error.value

  const plans = computed(() => data.value)
  const freePlan = computed(() => plans.value?.find(p => p.id === STARTER_PLAN_ID) ?? null)
  const growthPlan = computed(() => plans.value?.find(p => p.id === NEW_SALE_PLAN_ID) ?? null)

  function monthlyPrice(plan: Plan): number | null {
    return plan.prices.find(p => p.interval === 'month')?.amount ?? null
  }

  function annualPrice(plan: Plan): number | null {
    return plan.prices.find(p => p.interval === 'year')?.amount ?? null
  }

  function formatPrice(cents: number): string {
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  /**
   * What this plan charges for the requested interval, as Stripe returned it —
   * or null when Stripe returned no such price.
   *
   * A plan with no subscription prices at all is the canonical no-subscription
   * plan and costs nothing; that is a fact about the plan, not a stand-in. A
   * paid plan whose requested interval the provider did not return has no
   * price to show, and answering that with '$0' offered a paid plan for free
   * every time the Stripe catalog was incomplete. Annual is never inferred
   * from monthly, nor monthly from annual: the caller renders the unavailable
   * state instead.
   */
  function displayPrice(plan: Plan, annual: boolean): string | null {
    if (plan.prices.length === 0) return formatPrice(0)
    const cents = annual ? annualPrice(plan) : monthlyPrice(plan)
    return cents === null ? null : formatPrice(cents)
  }

  return { plans, freePlan, growthPlan, monthlyPrice, annualPrice, formatPrice, displayPrice, status, error }
}
