import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  getPublishedTenantBlogPostBySlug,
  renderTenantBlogMarkdown,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'

export default defineEventHandler(async (event) => {
  if (event.context.tenantType !== 'tenant' || !event.context.siteId) {
    return textResponse('Post not found\n', { status: 404 })
  }

  const slugParam = getRouterParam(event, 'slug')
  const pathMatch = event.path?.match(/^\/blog-md\/(.+)\.md$/)
  const rawSlug = String(
    typeof slugParam === 'string' && slugParam.trim()
      ? slugParam
      : pathMatch?.[1]
      ?? '',
  ).trim()
  const slug = rawSlug.endsWith('.md') ? rawSlug.slice(0, -'.md'.length) : rawSlug
  if (!slug) return textResponse('Post not found\n', { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const post = await getPublishedTenantBlogPostBySlug(db, String(event.context.siteId), slug)
  if (!post) return textResponse('Post not found\n', { status: 404 })

  return textResponse(renderTenantBlogMarkdown(post, resolvePublicOrigin(event)), {}, 'text/markdown; charset=utf-8')
})
