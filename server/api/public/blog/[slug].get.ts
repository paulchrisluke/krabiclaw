import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedBlogPost } from '~/server/utils/content/publishing'

/**
 * One KrabiClaw blog article, by slug. The path used to carry the category as
 * well, which is what made the category a required field drawn from a fixed
 * list on this site while every other site's is the author's own word.
 */
export default defineHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) return jsonResponse({ error: 'Slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  // Tenant resolution already verified the site's preview cookie for this host.
  const post = await getPublishedBlogPost(db, null, slug, env, Boolean(event.context.previewAuthorized))
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  return jsonResponse({ post })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
