import type { PublicBlawbyIdentity, PublicBlawbyShellData, PublicConsultationSettings, PublicCompliance, PublicNavigationItem, PublicOfferingLink, PublicTenantPage } from '~/types/blawby'
import { ApiClientError, isRecord, publicApiRequest } from '~/utils/api-clients'

export interface BlawbyCriticalHomePayload {
  success: true
  shell: PublicBlawbyShellData
  page: PublicTenantPage
}

const isBlawbyCriticalHomePayload = (value: unknown): value is BlawbyCriticalHomePayload =>
  isRecord(value)
  && value.success === true
  && isRecord(value.shell)
  && isRecord(value.shell.identity)
  && typeof value.shell.identity.brand_name === 'string'
  && value.shell.identity.brand_name.trim().length > 0
  && Array.isArray(value.shell.navigation)
  && isRecord(value.shell.consultation)
  && isRecord(value.shell.themeTokens)
  && Array.isArray(value.shell.offeringLinks)
  && isRecord(value.page)
  && typeof value.page.path === 'string'
  && value.page.path === '/'
  && Array.isArray(value.page.blocks)
  && value.page.blocks.some(block => isRecord(block) && block.type === 'hero')

interface BlawbyCriticalShellRefs {
  data: Ref<BlawbyCriticalHomePayload>
  identity: ComputedRef<PublicBlawbyIdentity>
  navigation: ComputedRef<PublicNavigationItem[]>
  consultation: ComputedRef<PublicConsultationSettings>
  compliance: ComputedRef<PublicCompliance | null>
  themeTokens: ComputedRef<ApiRecord>
  offeringLinks: ComputedRef<PublicOfferingLink[]>
}

export async function useBlawbyCriticalHome(): Promise<BlawbyCriticalShellRefs> {
  const { siteId, isTenant } = useTenantSite()
  if (!isTenant || !siteId) {
    throw createError({ statusCode: 404, statusMessage: 'Blawby site context is unavailable' })
  }

  const key = `blawby-critical-home-${siteId}`
  const asyncData = await useAsyncData<BlawbyCriticalHomePayload>(
    key,
    async () => {
      if (import.meta.server) {
        const requestEvent = useRequestEvent()
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { resolvePublicBlawbyCriticalHomeOrThrow }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/professional-services'),
        ])
        const db = cloudflareEnv(requestEvent).db
        if (!db) throw createError({ statusCode: 503, statusMessage: 'Database not available' })
        return await resolvePublicBlawbyCriticalHomeOrThrow(db, siteId)
      }
      return await publicApiRequest<BlawbyCriticalHomePayload>(
        `/api/public/sites/${encodeURIComponent(siteId)}/blawby/critical`,
        { validate: isBlawbyCriticalHomePayload, coalesceKey: key },
      )
    },
    {
      server: true,
      lazy: false,
      getCachedData(cacheKey) {
        return useNuxtApp().payload.data[cacheKey] as BlawbyCriticalHomePayload | undefined
      },
    },
  )

  if (asyncData.error.value) throw asyncData.error.value
  if (!asyncData.data.value) {
    throw createError({ statusCode: 500, statusMessage: 'Blawby critical home data was not returned' })
  }
  if (!isBlawbyCriticalHomePayload(asyncData.data.value)) {
    throw new ApiClientError('Blawby critical home data did not match its contract', 502, 'INVALID_API_RESPONSE', null)
  }

  const data = asyncData.data as Ref<BlawbyCriticalHomePayload>
  return {
    data,
    identity: computed(() => data.value.shell.identity),
    navigation: computed(() => data.value.shell.navigation),
    consultation: computed(() => data.value.shell.consultation),
    compliance: computed(() => data.value.shell.compliance),
    themeTokens: computed(() => data.value.shell.themeTokens),
    offeringLinks: computed(() => data.value.shell.offeringLinks),
  }
}
