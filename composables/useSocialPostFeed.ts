import { publicApiRequest, isRecord } from '~/utils/api-clients'
import { isPublicSocialPost, type PublicSocialPost } from '~/utils/public-resource-contracts'

type Feed = { posts: PublicSocialPost[]; page_info: { has_more: boolean; next_cursor: string | null } }

const isFeedResponse = (value: unknown): value is { success: true } & Feed =>
  isRecord(value) && value.success === true && Array.isArray(value.posts) && value.posts.every(isPublicSocialPost)
  && isRecord(value.page_info) && typeof value.page_info.has_more === 'boolean'

/**
 * An organization's published posts, a page at a time, on every template.
 *
 * The first page is read on the server through the one public post reader and
 * on the client from the public feed API, which calls the same reader; later
 * pages follow the cursor it returned. A page that fails to load says so; it is
 * not replaced by anything.
 */
export async function useSocialPostFeed(scope: () => { locationId?: string | null }, options: { limit?: number } = {}) {
  const { locale } = useI18n()
  const { organizationId } = useTenantOrganization()
  if (!organizationId) throw createError({ statusCode: 404 })
  const requestEvent = useRequestEvent()
  const limit = options.limit ?? 12
  const request = (cursor: string | null) => ({
    locale: locale.value, limit, ...(cursor ? { cursor } : {}), ...(scope().locationId ? { location_id: scope().locationId! } : {}),
  })

  const { data: first, error } = await useAsyncData(
    () => `public-posts-${organizationId}-${locale.value}-${scope().locationId ?? ''}-${limit}`,
    async (): Promise<Feed> => {
      if (import.meta.server) {
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { listPublicSocialPosts }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/post-management'),
        ])
        const env = cloudflareEnv(requestEvent)
        if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database not available' })
        const locationId = scope().locationId ?? null
        return await listPublicSocialPosts(env, env.DB, organizationId, { locale: locale.value, locationId, window: { limit, offset: 0 },
          resource: `public-posts:${organizationId}:${locale.value}:${locationId ?? ''}` })
      }
      return await publicApiRequest<{ success: true } & Feed>('/api/public/posts', { query: request(null), validate: isFeedResponse })
    },
  )
  if (error.value) throw error.value

  const extra = ref<PublicSocialPost[]>([])
  const cursor = ref<string | null>(null)
  const hasMore = ref(false)
  const loading = ref(false)
  const failed = ref<string | null>(null)
  watch(first, (feed) => {
    extra.value = []
    cursor.value = feed?.page_info.next_cursor ?? null
    hasMore.value = feed?.page_info.has_more ?? false
  }, { immediate: true })
  const posts = computed(() => [...(first.value?.posts ?? []), ...extra.value])
  async function loadMore() {
    if (!cursor.value || loading.value) return
    loading.value = true
    failed.value = null
    try {
      const page = await publicApiRequest<{ success: true } & Feed>('/api/public/posts', { query: request(cursor.value), validate: isFeedResponse })
      extra.value = [...extra.value, ...page.posts]
      cursor.value = page.page_info.next_cursor
      hasMore.value = page.page_info.has_more
    } catch (cause) {
      failed.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      loading.value = false
    }
  }
  return { posts, hasMore, loading, failed, loadMore }
}
