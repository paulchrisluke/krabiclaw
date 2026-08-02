import type { PublicBlawbyShellData } from '~/types/blawby'
import { isRecord, publicApiRequest } from '~/utils/api-clients'

type BlawbyShellPayload = PublicBlawbyShellData & { success: boolean }

const isBlawbyShellPayload = (value: unknown): value is BlawbyShellPayload =>
  isRecord(value)
  && value.success === true
  && isRecord(value.identity)
  && Array.isArray(value.navigation)
  && isRecord(value.consultation)
  && isRecord(value.themeTokens)
  && Array.isArray(value.offeringLinks)

export async function useBlawbyShell() {
  const { siteId, isTenant } = useTenantSite()
  if (!isTenant || !siteId) {
    throw createError({ statusCode: 404, statusMessage: 'Blawby site context is unavailable' })
  }

  const asyncData = await useAsyncData<BlawbyShellPayload>(
    `blawby-shell-${siteId}`,
    async () => {
      if (import.meta.server) {
        const requestEvent = useRequestEvent()
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { getActiveBlawbySite, getPublicBlawbyShellData }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/professional-services'),
        ])
        const db = cloudflareEnv(requestEvent).db
        if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
        const site = await getActiveBlawbySite(db, siteId)
        if (!site) throw createError({ statusCode: 404, statusMessage: 'Blawby is not enabled for this site' })
        return { success: true, ...(await getPublicBlawbyShellData(db, siteId)) }
      }
      return await publicApiRequest<BlawbyShellPayload>(`/api/public/sites/${siteId}/blawby/shell`, {
        validate: isBlawbyShellPayload,
      })
    },
    {
      server: true,
      lazy: false,
      getCachedData(cacheKey) {
        return useNuxtApp().payload.data[cacheKey] as BlawbyShellPayload | undefined
      },
    },
  )

  if (asyncData.error.value) throw asyncData.error.value
  if (!asyncData.data.value) throw createError({ statusCode: 500, statusMessage: 'Blawby shell data was not returned' })
  const data = asyncData.data as Ref<BlawbyShellPayload>
  return {
    ...asyncData,
    identity: computed(() => data.value!.identity),
    navigation: computed(() => data.value!.navigation),
    consultation: computed(() => data.value!.consultation),
    compliance: computed(() => data.value!.compliance),
    themeTokens: computed(() => data.value!.themeTokens),
    offeringLinks: computed(() => data.value!.offeringLinks),
  }
}
