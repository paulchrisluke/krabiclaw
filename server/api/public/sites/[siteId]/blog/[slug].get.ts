import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedLocalizedSiteBlogPost } from '~/server/utils/content/publishing'
import { assertExactCanonicalLocale } from '~/server/utils/localization'
import { getQuery } from 'nitro/h3'
import { previewSecretOf, resolvePreviewAuthorization } from '~/server/utils/preview-token'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Site ID and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const locale = assertExactCanonicalLocale(query.locale ?? 'en')
  // /api/public/sites/** is excluded from tenant resolution (it carries its own
  // site id), so this route resolves the site's preview authorization itself.
  const previewAuthorized = await resolvePreviewAuthorization(event, siteId, previewSecretOf(env))
  const post = await getPublishedLocalizedSiteBlogPost(db, siteId, slug, locale, env, previewAuthorized)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  return jsonResponse({ post })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
