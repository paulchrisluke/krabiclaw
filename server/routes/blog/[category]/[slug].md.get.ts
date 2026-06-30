import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  getPublishedPlatformBlogPostBySlug,
  renderPlatformBlogMarkdown,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'

export default defineEventHandler(async (event) => {
  const category = getRouterParam(event, 'category')
  const slug = getRouterParam(event, 'slug')
  if (!category || !slug) return textResponse('Post not found\n', { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const post = await getPublishedPlatformBlogPostBySlug(db, category, slug)
  if (!post) return textResponse('Post not found\n', { status: 404 })

  return textResponse(renderPlatformBlogMarkdown(post, resolvePublicOrigin(event)), {}, 'text/markdown; charset=utf-8')
})
