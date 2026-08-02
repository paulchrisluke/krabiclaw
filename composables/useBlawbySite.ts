import type { PublicBlawbyData, PublicOffering, PublicTenantPage } from '~/types/blawby'
import { isRecord, publicApiRequest } from '~/utils/api-clients'

type BlawbyPayload = PublicBlawbyData & { success: boolean }

const isBlawbyPayload = (value: unknown): value is BlawbyPayload =>
  isRecord(value)
  && value.success === true
  && Array.isArray(value.offerings)
  && Array.isArray(value.tenantPages)
  && isRecord(value.consultation)
  && Array.isArray(value.navigation)
  && isRecord(value.themeTokens)

export function useBlawbySite() {
  const { siteId, isTenant } = useTenantSite()
  if (!isTenant || !siteId) {
    throw createError({ statusCode: 404, statusMessage: 'Blawby site context is unavailable' })
  }
  const key = computed(() => `blawby-site-${siteId}`)

  const asyncData = useAsyncData<BlawbyPayload>(
    key.value,
    async (): Promise<BlawbyPayload> => {
      if (import.meta.server) {
        const requestEvent = useRequestEvent()
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { getActiveBlawbySite, getPublicBlawbyData }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/professional-services'),
        ])
        const db = cloudflareEnv(requestEvent).db
        if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
        const site = await getActiveBlawbySite(db, siteId)
        if (!site) throw createError({ statusCode: 404, statusMessage: 'Blawby is not enabled for this site' })
        const payload = await getPublicBlawbyData(db, siteId)
        return { success: true, ...payload }
      }
      return await publicApiRequest<BlawbyPayload>(`/api/public/sites/${siteId}/blawby`, {
        validate: isBlawbyPayload,
      })
    },
    {
      server: true,
      lazy: false,
      getCachedData(k) {
        return useNuxtApp().payload.data[k] as BlawbyPayload | undefined
      },
    },
  )

  if (asyncData.error.value) throw asyncData.error.value
  if (!asyncData.data.value) throw createError({ statusCode: 500, statusMessage: 'Blawby data was not returned' })

  const data = asyncData.data as Ref<BlawbyPayload>
  const { error, pending } = asyncData

  const offerings = computed<PublicOffering[]>(() => data.value!.offerings)
  const tenantPages = computed<PublicTenantPage[]>(() => data.value!.tenantPages)
  const compliance = computed(() => data.value!.compliance)
  const consultation = computed(() => data.value!.consultation)
  const navigation = computed(() => data.value!.navigation)
  const themeTokens = computed(() => data.value!.themeTokens)

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
