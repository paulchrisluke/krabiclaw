import { ARTICLE_COLLECTIONS, articleCategoryToSlug, collectionArticlePath } from '~/utils/article-collections'
import { isRecord, publicApiRequest } from '~/utils/api-clients'

/**
 * Documentation is KrabiClaw's `docs` article collection. The category is the
 * first path segment after /docs; an article whose slug equals its category
 * segment is that category's landing page. Order within a category is the
 * article's editorial sort order.
 */
export interface DocsArticle {
  id: string
  slug: string
  path: string
  title: string
  excerpt: string | null
  sortOrder: number
  category: string
  categorySlug: string
  isCategoryIndex: boolean
}

export interface DocsCategory {
  category: string
  categorySlug: string
  articles: DocsArticle[]
}

interface ArticleRow { id: string; slug: string; title: string; excerpt: string | null; category: string | null; sort_order: number }

const isArticleRow = (value: unknown): value is ArticleRow =>
  isRecord(value) && typeof value.id === 'string' && typeof value.slug === 'string' && typeof value.title === 'string'
  && (value.excerpt === null || value.excerpt === undefined || typeof value.excerpt === 'string')
  && (value.category === null || typeof value.category === 'string') && typeof value.sort_order === 'number'

function toDocsArticle(row: ArticleRow): DocsArticle | null {
  const categorySlug = articleCategoryToSlug('docs', row.category)
  if (!categorySlug || !row.category) return null
  return {
    id: row.id, slug: row.slug, path: collectionArticlePath('docs', row.category, row.slug), title: row.title, excerpt: row.excerpt ?? null,
    sortOrder: row.sort_order, category: row.category, categorySlug, isCategoryIndex: row.slug === categorySlug,
  }
}

export async function useDocsArticles() {
  const requestEvent = useRequestEvent()
  const asyncData = useAsyncData<{ posts: ArticleRow[] }>('docs-articles', async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { listPublicPlatformBlogPosts }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/content/publishing'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 503, statusMessage: 'Documentation is temporarily unavailable' })
      return { posts: (await listPublicPlatformBlogPosts(db, 'docs')) as unknown as ArticleRow[] }
    }
    return await publicApiRequest<{ posts: ArticleRow[] }>('/api/public/blog?collection=docs', {
      validate: (value): value is { posts: ArticleRow[] } => isRecord(value) && Array.isArray(value.posts) && value.posts.every(isArticleRow),
    })
  })
  // Callers decide routing from the list, so the list must be loaded before they continue.
  await asyncData
  const { data, pending, error } = asyncData

  const categoryOrder = Object.values(ARTICLE_COLLECTIONS.docs.categorySlugs ?? {})
  const articles = computed<DocsArticle[]>(() => (data.value?.posts ?? [])
    .map(toDocsArticle)
    .filter((article): article is DocsArticle => article !== null)
    .sort((a, b) => categoryOrder.indexOf(a.categorySlug) - categoryOrder.indexOf(b.categorySlug)
      || Number(b.isCategoryIndex) - Number(a.isCategoryIndex)
      || a.sortOrder - b.sortOrder
      || a.title.localeCompare(b.title)))

  const categories = computed<DocsCategory[]>(() => categoryOrder.flatMap((categorySlug) => {
    const group = articles.value.filter(article => article.categorySlug === categorySlug)
    return group.length ? [{ category: group[0]!.category, categorySlug, articles: group }] : []
  }))

  return { articles, categories, pending, error }
}
