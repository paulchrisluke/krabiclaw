import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  buildBlogRss,
  buildPlatformBlogLinkEntries,
  listPublishedPlatformBlogPostsForLlm,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const origin = resolvePublicOrigin(event)
  const posts = await listPublishedPlatformBlogPostsForLlm(db)
  return textResponse(
    buildBlogRss(origin, buildPlatformBlogLinkEntries(posts ?? [], origin)),
    {},
    'application/rss+xml; charset=utf-8',
  )
})
