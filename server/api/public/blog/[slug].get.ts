// GET /api/public/blog/[slug]?collection=blog|docs&locale=xx — one published article
//
// This was two routes with two fetchers. `getPublishedBlogPost` looked the
// platform site up and hardcoded it, and had no locale; the tenant route's
// `getPublishedLocalizedSiteBlogPost` took a site id from the URL and did
// support locales. The platform is an ordinary tenant, so the localized fetcher
// is the only one — the platform half was the same query missing a feature.
//
// The tenant comes from the host via tenant-resolution, which also settles
// preview authorization, so this route no longer resolves a preview token of
// its own the way the id-carrying route had to.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedLocalizedBlogPost } from '~/server/utils/content/publishing'
import { assertExactCanonicalLocale } from '~/server/utils/localization'
import { isArticleCollection } from '~/utils/article-collections'
import { defineHandler } from 'nitro'
import { getRouterParam, getQuery } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  if (!organizationId) return jsonResponse({ error: 'Unknown tenant' }, { status: 404 })

  const slug = getRouterParam(event, 'slug')
  if (!slug) return jsonResponse({ error: 'Slug required' }, { status: 400 })

  const query = getQuery(event)
  const requested = query.collection
  if (requested !== undefined && !isArticleCollection(requested)) {
    return jsonResponse({ error: 'Unknown collection' }, { status: 400 })
  }
  const collection = requested === undefined ? null : requested
  const locale = assertExactCanonicalLocale(query.locale ?? 'en')

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const post = await getPublishedLocalizedBlogPost(
    db,
    organizationId,
    slug,
    locale,
    env,
    Boolean(event.context.previewAuthorized),
    collection,
  )
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  return jsonResponse({ post })
})
