import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { ArticleCollection } from '~/utils/article-collections'
import { publicApiRequest } from '~/utils/api-clients'
import { validateApiShape } from '~/utils/api-validation'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'

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
 * the one list every blog, the docs, the sidebar, related posts and the
 * indexes read. It is what list_blog_posts returns, published and listed.
 * Categories keep the list's own order: the docs by their editorial order, the
 * blog newest first.
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
        const [{ cloudflareEnv }, { listPublishedArticles }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/content/publishing'),
        ])
        const env = cloudflareEnv(requestEvent)
        if (!env.db) throw createError({ statusCode: 503, statusMessage: 'Articles are temporarily unavailable' })
        return { posts: await listPublishedArticles(env.db, env, organizationId, toValue(collection), locale.value) }
      }
      return await publicApiRequest<{ posts: Array<Omit<PublishedArticle, 'path' | 'categorySlug'>> }>('/api/public/blog', {
        query: { collection: toValue(collection), locale: locale.value },
        validate: validateApiShape({ posts: { arrayOf: { id: 'string', slug: 'string', title: 'string', sort_order: 'number' } } }),
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
  return { posts, categories, pending }
}

/** The articles to read next: those sharing a tag with this one first, then the newest. */
export function relatedArticles(posts: readonly PublishedArticle[], current: { id?: string | null; slug: string; tags?: string[] | null }, limit = 3) {
  const others = posts.filter(post => post.id !== current.id && post.slug !== current.slug)
  const tags = current.tags ?? []
  const sharing = others.filter(post => post.tags?.some(tag => tags.includes(tag)))
  return [...sharing, ...others.filter(post => !sharing.includes(post))].slice(0, limit)
}
