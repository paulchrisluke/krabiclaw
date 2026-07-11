import type { PublicBlawbyData, PublicOffering, PublicTenantPage } from '~/types/blawby'

type BlawbyPayload = PublicBlawbyData & { success: boolean }

const emptyBlawbyPayload = (): BlawbyPayload => ({
  success: true,
  offerings: [],
  tenantPages: [],
  compliance: null,
  consultation: {
    mode: 'external_url',
    cta_label: 'Book a consultation',
    external_url: null,
    schedule_path: '/schedule',
    confirmation_path: '/contact/confirmed',
    tracking_enabled: true,
    contact_form_enabled: true,
    metadata: {},
  },
  navigation: [],
  themeTokens: {},
})

export function useBlawbySite() {
  const { siteId, isTenant } = useTenantSite()
  const key = computed(() => `blawby-site-${siteId || 'none'}`)

  const asyncData = !isTenant || !siteId
    ? { data: ref<BlawbyPayload>(emptyBlawbyPayload()), error: ref<Error | null>(null), pending: ref(false) }
    : useAsyncData<BlawbyPayload>(
        key.value,
        async (): Promise<BlawbyPayload> => {
          if (import.meta.server) {
            const requestEvent = useRequestEvent()
            if (!requestEvent) return emptyBlawbyPayload()
            const [{ cloudflareEnv }, { getPublicBlawbyData }] = await Promise.all([
              import('~/server/utils/api-response'),
              import('~/server/utils/professional-services'),
            ])
            const db = cloudflareEnv(requestEvent).db
            if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
            const payload = await getPublicBlawbyData(db, siteId)
            return {
              success: true,
              ...payload,
            }
          }
          const fetchBlawby = $fetch as unknown as (_url: string) => Promise<BlawbyPayload>
          return await fetchBlawby(`/api/public/sites/${siteId}/blawby`)
        },
        {
          default: emptyBlawbyPayload,
          server: true,
          lazy: true,
          getCachedData(k) {
            return useNuxtApp().payload.data[k] as BlawbyPayload | undefined
          },
        },
      )

  const { data, error, pending } = asyncData

  const offerings = computed<PublicOffering[]>(() => data.value?.offerings ?? [])
  const tenantPages = computed<PublicTenantPage[]>(() => data.value?.tenantPages ?? [])
  const compliance = computed(() => data.value?.compliance ?? null)
  const consultation = computed(() => data.value?.consultation ?? emptyBlawbyPayload().consultation)
  const navigation = computed(() => data.value?.navigation ?? [])
  const themeTokens = computed(() => data.value?.themeTokens ?? {})

  const pageByPath = (path: string) =>
    tenantPages.value.find((page: PublicTenantPage) => page.path === path) ?? null
  const offeringBySlug = (slug: string) =>
    offerings.value.find((offering: PublicOffering) => offering.slug === slug) ?? null

  return {
    data,
    error,
    pending,
    offerings,
    tenantPages,
    compliance,
    consultation,
    navigation,
    themeTokens,
    pageByPath,
    offeringBySlug,
  }
}
