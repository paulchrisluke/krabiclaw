import type { UpsellType } from './useServiceUpsell'
import type { Plan } from '~/server/api/billing/plans.get'

const SESSION_KEY = 'kc-upsell-shown'

export const useUpsellTriggers = () => {
  const { site } = useDashboardSite()
  const { open } = useServiceUpsell()

  const currentPlan = computed(() => site.value?.plan ?? 'free')

  const shouldSuggestGrowth = computed(() =>
    currentPlan.value === 'free' || currentPlan.value === null
  )

  async function loadPlanIds(): Promise<Set<string>> {
    try {
      const plans = await $fetch<Plan[]>('/api/billing/plans')
      return new Set(plans.map(plan => plan.id))
    } catch {
      return new Set()
    }
  }

  async function pickBestUpsell(): Promise<UpsellType | null> {
    if (shouldSuggestGrowth.value) return 'growth'

    const planIds = await loadPlanIds()
    if (currentPlan.value === 'growth' && planIds.has('managed')) return 'managed'
    if (currentPlan.value === 'managed' && planIds.has('seo_accelerator')) return 'seo_accelerator'
    return null
  }

  // Call once on mount — shows at most one auto-trigger per browser session.
  function evaluateAndSuggest() {
    if (typeof sessionStorage === 'undefined') return
    if (sessionStorage.getItem(SESSION_KEY)) return
    void pickBestUpsell().then((upsell) => {
      if (!upsell || sessionStorage.getItem(SESSION_KEY)) return
      sessionStorage.setItem(SESSION_KEY, '1')
      setTimeout(() => open(upsell, 'auto-trigger'), 2000)
    })
  }

  return {
    currentPlan,
    shouldSuggestGrowth,
    evaluateAndSuggest,
  }
}
