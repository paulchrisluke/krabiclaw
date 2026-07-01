// GET /api/public/blog/[category]/[slug] - Get single published blog post, scoped to its category
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedPlatformBlogPost } from '~/server/utils/platform-content'
import { slugToBlogCategory } from '~/utils/blog-categories'

export default defineEventHandler(async (event) => {
  const categorySlug = getRouterParam(event, 'category')
  const slug = getRouterParam(event, 'slug')
  if (!categorySlug || !slug) return jsonResponse({ error: 'Category and slug required' }, { status: 400 })

  const category = slugToBlogCategory(categorySlug)
  if (!category) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const post = await getPublishedPlatformBlogPost(db, category, slug)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  return jsonResponse({ post })
})
