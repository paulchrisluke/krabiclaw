import { CATEGORY_SLUGS as DOCS_CATEGORY_SLUGS } from '~/utils/docs-categories'

/**
 * An article belongs to a collection. Every site has a blog; KrabiClaw's own
 * site (the platform template) also publishes documentation. Both collections
 * share the article model, editor, feeds and markdown routes; the collection
 * decides the URL prefix and whether the URL carries a category.
 *
 * A blog's category is the author's own word, on every site including this one.
 * KrabiClaw's blog used to file articles under a fixed six-item taxonomy that
 * shaped the URL, which made the category a required field with a closed list
 * on one site and free text on every other — and, because the creation form
 * never offered it, made a post impossible to create here at all.
 *
 * Documentation keeps its category in the path, because there the category is
 * a navigation level with a landing page, not a label.
 */
export type ArticleCollection = 'blog' | 'docs'

export interface ArticleCollectionDefinition {
  slug: ArticleCollection
  label: string
  pathPrefix: string
  /** Category label -> URL segment, for the collection whose URL carries one. */
  categorySlugs: Record<string, string> | null
}

export const ARTICLE_COLLECTIONS: Record<ArticleCollection, ArticleCollectionDefinition> = {
  blog: { slug: 'blog', label: 'Blog', pathPrefix: '/blog', categorySlugs: null },
  docs: { slug: 'docs', label: 'Documentation', pathPrefix: '/docs', categorySlugs: DOCS_CATEGORY_SLUGS },
}

export const ARTICLE_COLLECTION_SLUGS = Object.keys(ARTICLE_COLLECTIONS) as ArticleCollection[]

export function isArticleCollection(value: unknown): value is ArticleCollection {
  return typeof value === 'string' && value in ARTICLE_COLLECTIONS
}

/** The collection's fixed category list, or null when the category is free text. */
export function articleCollectionCategories(collection: ArticleCollection): string[] | null {
  const slugs = ARTICLE_COLLECTIONS[collection].categorySlugs
  return slugs ? Object.keys(slugs) : null
}

export function articleCategoryToSlug(collection: ArticleCollection, category: string | null | undefined): string | null {
  const slugs = ARTICLE_COLLECTIONS[collection].categorySlugs
  if (!slugs || !category) return null
  return slugs[category] ?? null
}

export function articleCategoryFromSlug(collection: ArticleCollection, categorySlug: string | null | undefined): string | null {
  const slugs = ARTICLE_COLLECTIONS[collection].categorySlugs
  if (!slugs || !categorySlug) return null
  const match = Object.entries(slugs).find(([, slug]) => slug === categorySlug)
  return match?.[0] ?? null
}

/**
 * The public path of an article in a collection. A blog article is
 * `/blog/{slug}` on every site. A documentation article carries its category
 * segment: `/docs/{category}/{slug}`, and an article whose slug is its own
 * category segment is that category's landing page (`/docs/{category}`).
 */
export function collectionArticlePath(collection: ArticleCollection, category: string | null | undefined, slug: string): string {
  const definition = ARTICLE_COLLECTIONS[collection]
  if (!definition.categorySlugs) return `${definition.pathPrefix}/${encodeURIComponent(slug)}`
  const categorySlug = articleCategoryToSlug(collection, category) ?? 'uncategorized'
  if (slug === categorySlug) return `${definition.pathPrefix}/${categorySlug}`
  return `${definition.pathPrefix}/${categorySlug}/${encodeURIComponent(slug)}`
}
