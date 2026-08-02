import type { BlawbyRouteRecipe, PublicBlawbyRouteData } from '~/types/blawby'
import { isRecord, publicApiRequest } from '~/utils/api-clients'

type BlawbyRoutePayload = PublicBlawbyRouteData & { success: boolean }

const isBlawbyRoutePayload = (value: unknown): value is BlawbyRoutePayload =>
  isRecord(value)
  && value.success === true
  && typeof value.recipe === 'string'
  && Array.isArray(value.offerings)
  && Array.isArray(value.qa)
  && Array.isArray(value.reviews)
  && Array.isArray(value.posts)

export async function useBlawbyRoute(recipe: BlawbyRouteRecipe, slug?: string | null) {
  const { siteId, isTenant } = useTenantSite()
  if (!isTenant || !siteId) {
    throw createError({ statusCode: 404, statusMessage: 'Blawby site context is unavailable' })
  }
  const normalizedSlug = slug?.trim() || ''
  const key = `blawby-route-${siteId}-${recipe}-${normalizedSlug || 'index'}`

  const asyncData = await useAsyncData<BlawbyRoutePayload>(
    key,
    async () => {
      if (import.meta.server) {
        const requestEvent = useRequestEvent()
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { getActiveBlawbySite, getPublicBlawbyRouteData, hasPublicBlawbyRouteContent }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/professional-services'),
        ])
        const db = cloudflareEnv(requestEvent).db
        if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
        const site = await getActiveBlawbySite(db, siteId)
        if (!site) throw createError({ statusCode: 404, statusMessage: 'Blawby is not enabled for this site' })
        const route = await getPublicBlawbyRouteData(db, siteId, recipe, { slug: normalizedSlug })
        if (!hasPublicBlawbyRouteContent(route)) throw createError({ statusCode: 404, statusMessage: 'Route content not found' })
        return { success: true, ...route }
      }
      return await publicApiRequest<BlawbyRoutePayload>('/api/public/sites/' + encodeURIComponent(siteId) + '/blawby/route', {
        query: { recipe, ...(normalizedSlug ? { slug: normalizedSlug } : {}) },
        validate: isBlawbyRoutePayload,
      })
    },
    {
      server: true,
      lazy: false,
      getCachedData(cacheKey) {
        return useNuxtApp().payload.data[cacheKey] as BlawbyRoutePayload | undefined
      },
    },
  )

  if (asyncData.error.value) throw asyncData.error.value
  if (!asyncData.data.value) throw createError({ statusCode: 500, statusMessage: 'Blawby route data was not returned' })

  return {
    ...asyncData,
    data: asyncData.data as Ref<BlawbyRoutePayload>,
  }
}
