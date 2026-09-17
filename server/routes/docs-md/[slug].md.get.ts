import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  getPublishedPlatformDocBySlug, renderPlatformDocMarkdown, resolvePublicOrigin, } from '~/server/utils/platform-llm'

/**
 * The markdown mirror of one documentation article. It used to answer at
 * /docs-md/{category}/{slug}.md, because the article's own path carried the
 * category between the prefix and the slug.
 */
export default defineHandler(async (event) => {
  const slugParam = getRouterParam(event, 'slug')
  if (!slugParam) return textResponse('Documentation not found\n', { status: 404 })
  const slug = slugParam.endsWith('.md') ? slugParam.slice(0, -'.md'.length) : slugParam
  if (!slug) return textResponse('Documentation not found\n', { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const doc = await getPublishedPlatformDocBySlug(db, slug)
  if (!doc) return textResponse('Documentation not found\n', { status: 404 })

  return textResponse(renderPlatformDocMarkdown(doc, resolvePublicOrigin(event)), {}, 'text/markdown; charset=utf-8')
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
