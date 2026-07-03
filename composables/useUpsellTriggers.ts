import type { UpsellType } from './useServiceUpsell'

const SESSION_KEY = 'kc-upsell-shown'

export const useUpsellTriggers = () => {
  const { site } = useDashboardSite()
  const { open } = useServiceUpsell()
  const { managedPlan, seoAcceleratorPlan } = usePlans()

  const currentPlan = computed(() => site.value?.plan ?? 'free')

  const shouldSuggestGrowth = computed(() =>
    currentPlan.value === 'free' || currentPlan.value === null
  )

  // Never suggest a tier that's currently hidden (MANAGED_SERVICE_ENABLED
  // off) — usePlans() only returns it when it's actually purchasable.
  const shouldSuggestManaged = computed(() =>
    currentPlan.value === 'growth' && Boolean(managedPlan.value)
  )

  const shouldSuggestSeo = computed(() =>
    currentPlan.value === 'managed' && Boolean(seoAcceleratorPlan.value)
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
