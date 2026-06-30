import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  getPublishedPlatformDocBySlug,
  renderPlatformDocMarkdown,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'

export default defineEventHandler(async (event) => {
  const category = getRouterParam(event, 'category')
  const slug = getRouterParam(event, 'slug')
  if (!category || !slug) return textResponse('Documentation not found\n', { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const doc = await getPublishedPlatformDocBySlug(db, category, slug)
  if (!doc) return textResponse('Documentation not found\n', { status: 404 })

  return textResponse(renderPlatformDocMarkdown(doc, resolvePublicOrigin(event)), {}, 'text/markdown; charset=utf-8')
})
