import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  buildLlmsFullTxt,
  getPublishedPlatformBlogPostBySlug,
  getPublishedPlatformDocBySlug,
  listPublishedPlatformBlogPostsForLlm,
  listPublishedPlatformDocsForLlm,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'
import { blogCategoryToSlug } from '~/utils/blog-categories'
import { categoryToSlug } from '~/utils/docs-categories'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const origin = resolvePublicOrigin(event)
  const [docSummaries, postSummaries] = await Promise.all([
    listPublishedPlatformDocsForLlm(db),
    listPublishedPlatformBlogPostsForLlm(db),
  ])

  const docs = (await Promise.all(
    (docSummaries ?? []).flatMap((doc) => {
      const categorySlug = categoryToSlug(doc.category)
      if (!categorySlug) return []
      return [getPublishedPlatformDocBySlug(db, categorySlug, doc.slug)]
    }),
  )).filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))

  const posts = (await Promise.all(
    (postSummaries ?? []).flatMap((post) => {
      const categorySlug = blogCategoryToSlug(post.category)
      if (!categorySlug) return []
      return [getPublishedPlatformBlogPostBySlug(db, categorySlug, post.slug)]
    }),
  )).filter((post): post is NonNullable<typeof post> => Boolean(post))

  return textResponse(buildLlmsFullTxt(origin, docs, posts))
})
