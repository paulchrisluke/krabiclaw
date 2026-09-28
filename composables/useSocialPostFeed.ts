import { publicApiRequest, isRecord } from '~/utils/api-clients'
import { isPublicSocialPost, type PublicSocialPost } from '~/utils/public-resource-contracts'

type Feed = { posts: PublicSocialPost[]; page_info: { has_more: boolean; next_cursor: string | null } }

const isFeedResponse = (value: unknown): value is { success: true } & Feed =>
  isRecord(value) && value.success === true && Array.isArray(value.posts) && value.posts.every(isPublicSocialPost)
  && isRecord(value.page_info) && typeof value.page_info.has_more === 'boolean'

/**
 * A feed that starts from the page's first page and reads later pages from
 * the public feed API with the cursor it returned. A page that fails to load
 * says so; it is not replaced by anything.
 */
export function useSocialPostFeed(first: () => Feed | null, scope: () => { locationId?: string | null }) {
  const { locale } = useI18n()
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
  const posts = computed(() => [...(first()?.posts ?? []), ...extra.value])
  async function loadMore() {
    if (!cursor.value || loading.value) return
    loading.value = true
    failed.value = null
    try {
      const page = await publicApiRequest<{ success: true } & Feed>('/api/public/posts', {
        query: { locale: locale.value, cursor: cursor.value, ...(scope().locationId ? { location_id: scope().locationId! } : {}) },
        validate: isFeedResponse,
      })
      extra.value = [...extra.value, ...page.posts]
      cursor.value = page.page_info.next_cursor
      hasMore.value = page.page_info.has_more
    } catch (error) {
      failed.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.value = false
    }
  }
  return { posts, hasMore, loading, failed, loadMore }
}
