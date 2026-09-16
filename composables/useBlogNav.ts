import { publicApiRequest } from '~/utils/api-clients'
import { validateApiShape } from '~/utils/api-validation'

interface PublicBlogPost {
  id: string
  slug: string
  title: string
  category?: string | null
  excerpt?: string | null
  published_at?: string | null
  cover?: {
    asset_id: string
    public_url: string | null
    thumbnail_url: string | null
    kind: string | null
    alt_text: string | null
    width: number | null
    height: number | null
  } | null
}

interface BlogNavCategory {
  category: string
  categorySlug: string
  posts: Array<PublicBlogPost & { label: string }>
}

export function useBlogNav() {
  const requestEvent = useRequestEvent()
  const { data, pending, error } = useAsyncData<{ posts: PublicBlogPost[] }>('public-blog-index', async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { listPublicPlatformBlogPosts }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/content/publishing'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 503, statusMessage: 'Blog data is temporarily unavailable' })
      return { posts: await listPublicPlatformBlogPosts(db) }
    }
    return await publicApiRequest<{ posts: PublicBlogPost[] }>('/api/public/blog', {
      validate: validateApiShape({ posts: { arrayOf: { id: 'string', slug: 'string', title: 'string' } } }),
    })
  })

  const posts = computed<PublicBlogPost[]>(() => data.value?.posts ?? [])

  // Grouped by the category each article carries, the same way every other
  // site's blog groups: KrabiClaw's used to read a fixed list of six labels,
  // so an article filed under anything else was listed nowhere.
  const labelled = computed(() => posts.value.map(post => ({ ...post, label: post.title })))
  const { categories: grouped } = useTenantBlogNav(labelled)
  const categories = computed<BlogNavCategory[]>(() => grouped.value)

  return { posts, categories, pending, error }
}
