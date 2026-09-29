import type { ArticleCollection } from '~/utils/article-collections'

/** One of a collection's categories, as the dashboard reads it. */
export interface DashboardArticleCategory {
  id: string
  collection: ArticleCollection
  name: string
  slug: string
  description: string | null
  sort_order: number
  article_count: number
}

const isCategory = (value: unknown): value is DashboardArticleCategory =>
  isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.slug === 'string'
  && (value.description === null || typeof value.description === 'string') && typeof value.sort_order === 'number' && typeof value.article_count === 'number'
export const isCategoriesResponse = (value: unknown): value is { categories: DashboardArticleCategory[] } =>
  isRecord(value) && Array.isArray(value.categories) && value.categories.every(isCategory)
export const isCategoryResponse = (value: unknown): value is { category: DashboardArticleCategory } =>
  isRecord(value) && isCategory(value.category)

/**
 * One collection's categories in the owner's order — what the post's Category
 * leaf picks from and the Categories list manages. Keyed by the collection, so
 * switching a post between the blog and the docs reads the other list.
 */
export function useArticleCategories(organizationId: string, collection: MaybeRefOrGetter<ArticleCollection>) {
  const dashboardApi = useDashboardApi()
  return useAsyncData(
    () => `article-categories:${organizationId}:${toValue(collection)}`,
    async () => (await dashboardApi(`/api/editor/organizations/${organizationId}/blog/categories`, {
      query: { collection: toValue(collection) }, validate: isCategoriesResponse,
    })).categories,
  )
}
