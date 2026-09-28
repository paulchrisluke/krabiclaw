import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { ArticleCollection } from '~/utils/article-collections'
import { isRecord, publicApiRequest } from '~/utils/api-clients'
import { validateApiShape } from '~/utils/api-validation'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import type { SocialImageSource } from '~/utils/social-metadata'
import type { BlogEditorBlock } from '~/lib/components/workspace/blog/types'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

export interface PublishedArticle {
  id: string
  slug: string
  title: string
  excerpt?: string | null
  category?: string | null
  tags?: string[] | null
  published_at?: string | null
  updated_at?: string | null
  sort_order: number
  cover?: { asset_id: string; public_url: string | null; thumbnail_url: string | null; kind: string | null; alt_text: string | null; width: number | null; height: number | null } | null
  /** Where this site serves the article, in the page's language. */
  path: string
  categorySlug: string
}

interface PublishedArticlesResponse {
  posts: Array<Omit<PublishedArticle, 'path' | 'categorySlug'>>
  /** The page the site publishes at the collection's index path, if any. */
  index: { title: string; summary: string | null } | null
}

export interface PublishedArticleCategory {
  category: string
  categorySlug: string
  posts: PublishedArticle[]
}

const categoryOf = (post: { category?: string | null }) => post.category?.trim() || 'Uncategorized'

function slugifyCategory(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'uncategorized'
}

/**
 * The site's published articles in one collection, in the page's language —
 * the one list every blog, the docs, the sidebar, previous/next and the
 * indexes read. It is what list_blog_posts returns, published and listed.
 * Categories keep the list's own order: the order the owner set, then newest
 * first.
 */
export async function usePublishedArticles(collection: MaybeRefOrGetter<ArticleCollection>) {
  const requestEvent = useRequestEvent()
  const { organizationId } = useTenantOrganization()
  if (!organizationId) throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  const { template } = usePublicTemplate()
  const { localePath } = useI18n()
  const locale = useState<string>('public-locale', () => 'en')

  const { data, pending, error } = await useAsyncData(
    () => `published-articles:${toValue(collection)}:${locale.value}`,
    async () => {
      if (import.meta.server) {
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { getArticleCollectionIndex, listPublishedArticles }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/content/publishing'),
        ])
        const env = cloudflareEnv(requestEvent)
        if (!env.db) throw createError({ statusCode: 503, statusMessage: 'Articles are temporarily unavailable' })
        const [posts, index] = await Promise.all([
          listPublishedArticles(env.db, env, organizationId, toValue(collection), locale.value),
          getArticleCollectionIndex(env.db, organizationId, toValue(collection), locale.value),
        ])
        return { posts, index } as unknown as PublishedArticlesResponse
      }
      return await publicApiRequest<PublishedArticlesResponse>('/api/public/blog', {
        query: { collection: toValue(collection), locale: locale.value },
        validate: validateApiShape({ posts: { arrayOf: { id: 'string', slug: 'string', title: 'string', sort_order: 'number' } }, index: 'nullable-object' }),
      })
    },
  )
  const posts = computed<PublishedArticle[]>(() => (data.value?.posts ?? []).map(post => ({
    ...post,
    path: localePath(tenantBlogPostPath(template.value, post.slug, toValue(collection))),
    categorySlug: slugifyCategory(categoryOf(post)),
  })))

  const categories = computed<PublishedArticleCategory[]>(() => {
    const groups = new Map<string, PublishedArticleCategory>()
    for (const post of posts.value) {
      const group = groups.get(post.categorySlug) ?? { category: categoryOf(post), categorySlug: post.categorySlug, posts: [] }
      group.posts.push(post)
      groups.set(post.categorySlug, group)
    }
    return [...groups.values()]
  })

  if (error.value) throw error.value
  return { posts, categories, pending, index: computed(() => data.value?.index ?? null) }
}

export interface PublishedArticleDetail {
  id: string
  title: string
  slug: string
  excerpt?: string | null
  category?: string | null
  tags?: string[] | null
  seo_keywords?: string | null
  visibility?: 'listed' | 'unlisted'
  published_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  author?: { id: string; name: string | null; image: string | null } | null
  cover?: PublishedArticle['cover']
  social_image?: SocialImageSource | null
  content_blocks: BlogEditorBlock[]
  localeRepresentations: PublicLocaleRepresentation[]
}

const isArticleResponse = (value: unknown): value is { post: PublishedArticleDetail } =>
  isRecord(value) && isRecord(value.post)
  && typeof value.post.id === 'string' && typeof value.post.title === 'string' && typeof value.post.slug === 'string'
  && Array.isArray(value.post.content_blocks) && Array.isArray(value.post.localeRepresentations)

/**
 * One published article of a collection, in the page's language — the read
 * every article page on every template makes, through getPublishedBlogPost on
 * the server and its public route in the browser. A missing article is a 404;
 * a failed read is the failure it was, not a 404.
 */
export async function usePublishedArticle(collection: ArticleCollection, slug: MaybeRefOrGetter<string>) {
  const requestEvent = useRequestEvent()
  const { organizationId } = useTenantOrganization()
  if (!organizationId) throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  const locale = useState<string>('public-locale', () => 'en')
  // Taken before the read: after an await the component's context is gone.
  const localeRepresentations = useState<PublicLocaleRepresentation[]>('public-locale-representations', () => [])

  const { data, error } = await useAsyncData(
    () => `published-article:${collection}:${locale.value}:${toValue(slug)}`,
    async () => {
      if (import.meta.server) {
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { getPublishedBlogPost }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/content/publishing'),
        ])
        const env = cloudflareEnv(requestEvent)
        if (!env.db) throw createError({ statusCode: 503, statusMessage: 'Articles are temporarily unavailable' })
        // Preview authorization is the site's, resolved once by tenant resolution from the preview cookie.
        const post = await getPublishedBlogPost(env.db, organizationId, collection, toValue(slug), locale.value, env, Boolean(requestEvent.context.previewAuthorized))
        if (!post) throw createError({ statusCode: 404, statusMessage: 'Article not found' })
        return post as unknown as PublishedArticleDetail
      }
      const response = await publicApiRequest<{ post: PublishedArticleDetail }>(`/api/public/blog/${encodeURIComponent(toValue(slug))}`, {
        query: { collection, locale: locale.value },
        validate: isArticleResponse,
      })
      return response.post
    },
  )
  if (error.value) throw error.value
  if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })
  if (!data.value.content_blocks.length) throw createError({ statusCode: 500, statusMessage: 'Published article content is missing its canonical blocks' })
  // The language switcher offers this article's own translations.
  localeRepresentations.value = data.value.localeRepresentations
  return computed(() => data.value!)
}
