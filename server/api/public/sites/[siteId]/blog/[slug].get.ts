// GET /api/public/sites/[siteId]/blog/[slug] - Get a single published tenant blog post
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedLocalizedSiteBlogPost } from '~/server/utils/platform-content'
import { assertExactCanonicalLocale } from '~/server/utils/localization'
import { getQuery } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Site ID and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const locale = assertExactCanonicalLocale(getQuery(event).locale ?? 'en')
  const post = await getPublishedLocalizedSiteBlogPost(db, siteId, slug, locale, env)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  return jsonResponse({ post })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
