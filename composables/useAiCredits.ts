export interface AiCreditsResponse {
  plan: string
  planAllowance: number | null
  periodAllowance: number | null
  periodUsed: number
  periodRemaining: number | null
  periodStart: string
  periodEnd: string
  lifetimeUsed: number
  perChatCap: number | null
  sessionUsed: number
  sessionRemaining: number | null
  unlimited: boolean
  reconciliationRequired: boolean
}

const isCreditsRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const validateAiCreditsResponse = (value: unknown): value is AiCreditsResponse =>
  isCreditsRecord(value)
  && typeof value.plan === 'string'
  && (value.planAllowance === null || typeof value.planAllowance === 'number')
  && (value.periodAllowance === null || typeof value.periodAllowance === 'number')
  && typeof value.periodUsed === 'number'
  && (value.periodRemaining === null || typeof value.periodRemaining === 'number')
  && typeof value.periodStart === 'string'
  && typeof value.periodEnd === 'string'
  && typeof value.lifetimeUsed === 'number'
  && (value.perChatCap === null || typeof value.perChatCap === 'number')
  && typeof value.sessionUsed === 'number'
  && (value.sessionRemaining === null || typeof value.sessionRemaining === 'number')
  && typeof value.unlimited === 'boolean'
  && typeof value.reconciliationRequired === 'boolean'

export const useAiCredits = (siteId: Ref<string | null> | ComputedRef<string | null>) => {
  const dashboardApi = useDashboardApi()

  const plan = ref<string | null>(null)
  const planAllowance = ref<number | null>(null)
  const periodAllowance = ref<number | null>(null)
  const periodUsed = ref(0)
  const periodRemaining = ref<number | null>(null)
  const periodStart = ref<string | null>(null)
  const periodEnd = ref<string | null>(null)
  const lifetimeUsed = ref(0)
  const perChatCap = ref<number | null>(null)
  const sessionUsed = ref(0)
  const sessionRemaining = ref<number | null>(null)
  const unlimited = ref(false)
  const reconciliationRequired = ref(false)
  const error = ref<unknown>(null)

  const clear = () => {
    plan.value = null
    planAllowance.value = null
    periodAllowance.value = null
    periodUsed.value = 0
    periodRemaining.value = null
    periodStart.value = null
    periodEnd.value = null
    lifetimeUsed.value = 0
    perChatCap.value = null
    sessionUsed.value = 0
    sessionRemaining.value = null
    unlimited.value = false
    reconciliationRequired.value = false
    error.value = null
  }

  watch(siteId, clear)

  const fetch = async () => {
    if (import.meta.server) return
    if (!siteId.value) {
      clear()
      return
    }
    try {
      error.value = null
      const res = await dashboardApi<AiCreditsResponse>(`/api/ai/${siteId.value}/credits`, {
        validate: validateAiCreditsResponse,
      })
      plan.value = res.plan
      planAllowance.value = res.planAllowance
      periodAllowance.value = res.periodAllowance
      periodUsed.value = res.periodUsed
      periodRemaining.value = res.periodRemaining
      periodStart.value = res.periodStart
      periodEnd.value = res.periodEnd
      lifetimeUsed.value = res.lifetimeUsed
      perChatCap.value = res.perChatCap
      sessionUsed.value = res.sessionUsed
      sessionRemaining.value = res.sessionRemaining
      unlimited.value = res.unlimited
      reconciliationRequired.value = res.reconciliationRequired
    } catch (fetchError) {
      clear()
      error.value = fetchError
      throw fetchError
    }
  }

  /** Update the finite weekly remainder after an SSE AI action. */
  const update = (newRemaining: number | null) => {
    if (unlimited.value || newRemaining === null) return
    const previousRemaining = periodRemaining.value
    const observedUsage = previousRemaining === null
      ? 0
      : Math.max(0, previousRemaining - newRemaining)
    periodRemaining.value = newRemaining
    periodUsed.value += observedUsage
  }

  const isLow = computed(() => !unlimited.value && periodRemaining.value !== null && periodRemaining.value < 50)
  const isDepleted = computed(() => !unlimited.value && periodRemaining.value !== null && periodRemaining.value <= 0)

  return {
    plan,
    planAllowance,
    periodAllowance,
    periodUsed,
    periodRemaining,
    periodStart,
    periodEnd,
    lifetimeUsed,
    perChatCap,
    sessionUsed,
    sessionRemaining,
    unlimited,
    reconciliationRequired,
    error,
    isLow,
    isDepleted,
    fetch,
    update,
  }
}
