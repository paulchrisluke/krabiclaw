import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  buildLlmsTxt,
  buildPlatformBlogLinkEntries,
  buildPlatformDocLinkEntries,
  listPublishedPlatformBlogPostsForLlm,
  listPublishedPlatformDocsForLlm,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const origin = resolvePublicOrigin(event)
  const [docs, posts] = await Promise.all([
    listPublishedPlatformDocsForLlm(db),
    listPublishedPlatformBlogPostsForLlm(db),
  ])

  return textResponse(
    buildLlmsTxt(
      origin,
      buildPlatformDocLinkEntries(docs ?? [], origin),
      buildPlatformBlogLinkEntries(posts ?? [], origin),
    ),
  )
})
