export const useAiCredits = (siteId: Ref<string | null> | ComputedRef<string | null>) => {
  const dashboardApi = useDashboardApi()
  // Skip on server to avoid hydration issues
  if (import.meta.server) {
    return {
      balance: ref(null),
      total: ref(null),
      error: ref(null),
      isLow: computed(() => false),
      isDepleted: computed(() => false),
      fetch: async () => {},
      update: () => {},
    }
  }

  const balance = ref<number | null>(null)
  const total = ref<number | null>(null)
  const error = ref<unknown>(null)

  watch(siteId, () => {
    balance.value = null
    total.value = null
    error.value = null
  })

  const fetch = async () => {
    if (!siteId.value) {
      balance.value = null
      total.value = null
      error.value = null
      return
    }
    try {
      error.value = null
      const res = await dashboardApi<{ balance: number; total: number }>(`/api/ai/${siteId.value}/credits`, {
        validate: validateApiShape({ balance: 'number', total: 'number' }),
      })
      balance.value = res.balance
      total.value = res.total
    } catch (fetchError) {
      balance.value = null
      total.value = null
      error.value = fetchError
      throw fetchError
    }
  }

  const update = (newBalance: number | null) => {
    if (newBalance === null) return
    const prev = balance.value ?? 0
    const diff = prev - newBalance
    balance.value = newBalance
    if (total.value !== null) total.value = Math.max(total.value, total.value - diff + diff)
  }

  const isLow = computed(() => balance.value !== null && balance.value < 50)
  const isDepleted = computed(() => balance.value !== null && balance.value <= 0)

  return { balance, total, error, isLow, isDepleted, fetch, update }
}
