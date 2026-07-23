export const useAiCredits = (siteId: Ref<string | null> | ComputedRef<string | null>) => {
  // Skip on server to avoid hydration issues
  if (import.meta.server) {
    return {
      balance: ref(null),
      total: ref(null),
      isLow: computed(() => false),
      isDepleted: computed(() => false),
      fetch: async () => {},
      update: () => {},
    }
  }

  const balance = useState<number | null>('ai:credits:balance', () => null)
  const total = useState<number | null>('ai:credits:total', () => null)

  const fetch = async () => {
    if (!siteId.value) return
    try {
      const res = await $fetch<{ balance: number; total: number }>(`/api/ai/${siteId.value}/credits`)
      balance.value = res.balance
      total.value = res.total
    } catch {
      // non-critical
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

  return { balance, total, isLow, isDepleted, fetch, update }
}
