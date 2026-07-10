import type { BlawbyRouteRecipe, PublicBlawbyRouteData } from '~/types/blawby'

type BlawbyRoutePayload = PublicBlawbyRouteData & { success: boolean }

function emptyRoutePayload(recipe: BlawbyRouteRecipe): BlawbyRoutePayload {
  return {
    success: true,
    recipe,
    page: null,
    offerings: [],
    offering: null,
    qa: [],
    reviews: [],
    posts: [],
    post: null,
  }
}

export async function useBlawbyRoute(recipe: BlawbyRouteRecipe, slug?: string | null) {
  const { siteId, isTenant } = useTenantSite()
  const normalizedSlug = slug?.trim() || ''
  const key = `blawby-route-${siteId || 'none'}-${recipe}-${normalizedSlug || 'index'}`

  const asyncData = !isTenant || !siteId
    ? { data: ref<BlawbyRoutePayload>(emptyRoutePayload(recipe)), error: ref<Error | null>(null), pending: ref(false) }
    : await useAsyncData<BlawbyRoutePayload>(
        key,
        async () => {
          if (import.meta.server) {
            const requestEvent = useRequestEvent()
            if (!requestEvent) return emptyRoutePayload(recipe)
            const [{ cloudflareEnv }, { getPublicBlawbyRouteData }] = await Promise.all([
              import('~/server/utils/api-response'),
              import('~/server/utils/professional-services'),
            ])
            const db = cloudflareEnv(requestEvent).db
            if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
            const route = await getPublicBlawbyRouteData(db, siteId, recipe, { slug: normalizedSlug })
            return { success: true, ...route }
          }
          const fetchRoute = $fetch as unknown as (
            _url: string,
            _options: { query: { recipe: BlawbyRouteRecipe; slug?: string } },
          ) => Promise<BlawbyRoutePayload>
          return await fetchRoute(`/api/public/sites/${siteId}/blawby/route`, {
            query: { recipe, ...(normalizedSlug ? { slug: normalizedSlug } : {}) },
          })
        },
        {
          default: () => emptyRoutePayload(recipe),
          server: true,
          lazy: false,
          getCachedData(cacheKey) {
            return useNuxtApp().payload.data[cacheKey] as BlawbyRoutePayload | undefined
          },
        },
      )

  return asyncData
}
