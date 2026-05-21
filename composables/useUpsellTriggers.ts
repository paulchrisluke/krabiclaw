import type { UpsellType } from './useServiceUpsell'

const SESSION_KEY = 'kc-upsell-shown'

export const useUpsellTriggers = () => {
  const { restaurant } = useDashboardRestaurant()
  const { open } = useServiceUpsell()

  const currentPlan = computed(() => restaurant.value?.plan ?? 'free')

  const shouldSuggestGrowth = computed(() =>
    currentPlan.value === 'free' || currentPlan.value === null
  )

  const shouldSuggestManaged = computed(() =>
    currentPlan.value === 'growth'
  )

  const shouldSuggestSeo = computed(() =>
    currentPlan.value === 'managed'
  )

  function pickBestUpsell(): UpsellType | null {
    if (shouldSuggestGrowth.value) return 'growth'
    if (shouldSuggestManaged.value) return 'managed'
    if (shouldSuggestSeo.value) return 'seo_accelerator'
    return null
  }

  // Call once on mount — shows at most one auto-trigger per browser session.
  function evaluateAndSuggest() {
    if (typeof sessionStorage === 'undefined') return
    if (sessionStorage.getItem(SESSION_KEY)) return
    const upsell = pickBestUpsell()
    if (!upsell) return
    sessionStorage.setItem(SESSION_KEY, '1')
    setTimeout(() => open(upsell, 'auto-trigger'), 2000)
  }

  return {
    currentPlan,
    shouldSuggestGrowth,
    shouldSuggestManaged,
    shouldSuggestSeo,
    evaluateAndSuggest,
  }
}
