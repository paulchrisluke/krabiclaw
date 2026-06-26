// Dynamic sitemap source for @nuxtjs/sitemap (see sitemap.sources in nuxt.config.ts).
// Emits one entry per published doc at its nested /docs/[category]/[slug] URL.
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { categoryToSlug } from '~/utils/docs-categories'

export default defineSitemapEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const docs = await queryAll<ApiRecord>(
    db,
    `SELECT slug, category, updated_at FROM platform_docs WHERE status = 'published'`,
  )

  const entries: Array<{ loc: string; lastmod: string | undefined }> = []
  for (const doc of docs ?? []) {
    const categorySlug = categoryToSlug(doc.category as string | null)
    if (!categorySlug || !doc.slug) continue
    entries.push({
      loc: `/docs/${categorySlug}/${doc.slug}`,
      lastmod: doc.updated_at as string | undefined,
    })
  }
  return entries
})
