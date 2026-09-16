import { resolvePublicTemplate } from '~/utils/template-registry'
import { collectionArticlePath, type ArticleCollection } from '~/utils/article-collections'

/**
 * The public path of an article on a site. A blog article lives at the
 * template's own prefix — /blog or /article — with nothing between it and the
 * slug, on every site including KrabiClaw's. Documentation, which only
 * KrabiClaw publishes, carries its category as a navigation segment.
 */
export function tenantBlogPostPath(
  template: Parameters<typeof resolvePublicTemplate>[0],
  slug: string,
  category?: string | null,
  collection: ArticleCollection = 'blog',
) {
  const routes = resolvePublicTemplate(template).serviceRoutes
  if (collection === 'blog') return `${routes.articleDetailPrefix}/${encodeURIComponent(slug)}`
  return collectionArticlePath(collection, category, slug)
}
