import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  getPublishedPlatformBlogPostBySlug,
  renderPlatformBlogMarkdown,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'

export default defineEventHandler(async (event) => {
  const category = getRouterParam(event, 'category')
  const slugParam = getRouterParam(event, 'slug')
  if (!category || !slugParam?.endsWith('.md')) return textResponse('Post not found\n', { status: 404 })

  const slug = slugParam.slice(0, -'.md'.length)
  if (!slug) return textResponse('Post not found\n', { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const post = await getPublishedPlatformBlogPostBySlug(db, category, slug)
  if (!post) return textResponse('Post not found\n', { status: 404 })

  return textResponse(renderPlatformBlogMarkdown(post, resolvePublicOrigin(event), category), {}, 'text/markdown; charset=utf-8')
})
