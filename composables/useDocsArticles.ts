import { collectionArticlePath } from '~/utils/article-collections'
import { isRecord, publicApiRequest } from '~/utils/api-clients'

/**
 * Documentation is KrabiClaw's `docs` article collection, one article per slug.
 * The category groups the sidebar and the index; it is the author's own word,
 * slugified for an anchor, not a path segment and not a fixed list. Order
 * within a category is the article's editorial sort order.
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

const UNCATEGORIZED = 'Uncategorized'

function slugifyCategory(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'uncategorized'
}

function toDocsArticle(row: ArticleRow): DocsArticle {
  const category = row.category?.trim() || UNCATEGORIZED
  return {
    id: row.id, slug: row.slug, path: collectionArticlePath('docs', row.slug), title: row.title, excerpt: row.excerpt ?? null,
    sortOrder: row.sort_order, category, categorySlug: slugifyCategory(category),
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

  // Categories order by the editorial rank of their earliest article, so the
  // sidebar still reads in the order the author arranged, without a list of
  // names written in code that an author cannot add to.
  const mapped = computed<DocsArticle[]>(() => (data.value?.posts ?? []).map(toDocsArticle))
  const categories = computed<DocsCategory[]>(() => {
    const groups = new Map<string, DocsCategory>()
    for (const article of [...mapped.value].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))) {
      const group = groups.get(article.categorySlug)
        ?? { category: article.category, categorySlug: article.categorySlug, articles: [] }
      group.articles.push(article)
      groups.set(article.categorySlug, group)
    }
    return [...groups.values()]
  })

  const articles = computed<DocsArticle[]>(() => categories.value.flatMap(group => group.articles))

  return { articles, categories, pending, error }
}
