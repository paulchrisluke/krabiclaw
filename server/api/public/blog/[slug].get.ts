import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedBlogPost } from '~/server/utils/content/publishing'
import { isArticleCollection } from '~/utils/article-collections'

/**
 * One KrabiClaw article, by slug, in the named collection. Both collections'
 * paths used to carry the article's category, which is what made the category
 * a required field drawn from a list written in code.
 */
export default defineHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) return jsonResponse({ error: 'Slug required' }, { status: 400 })

  const requested = getQuery(event).collection
  const collection = requested === undefined ? 'blog' : requested
  if (!isArticleCollection(collection)) return jsonResponse({ error: 'Unknown collection' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  // Tenant resolution already verified the site's preview cookie for this host.
  const post = await getPublishedBlogPost(db, slug, env, Boolean(event.context.previewAuthorized), collection)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  return jsonResponse({ post })
})
import { defineHandler } from 'nitro';
import { getRouterParam, getQuery } from 'nitro/h3';
