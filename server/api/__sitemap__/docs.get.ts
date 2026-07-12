// Dynamic sitemap source for platform documentation.
// Tenant and non-production hosts never publish KrabiClaw platform docs.
import { getRequestURL } from 'h3'
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isNonIndexableHost } from '~/server/utils/seo-policy'
import { categoryToSlug } from '~/utils/docs-categories'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineSitemapEventHandler(async (event) => {
  if (isNonIndexableHost(getRequestURL(event).hostname)) return []
  if (event.context.tenantType !== TENANT_TYPES.PLATFORM) return []

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const docs = await queryAll<ApiRecord>(
    db,
    `SELECT slug, category, updated_at
     FROM platform_docs
     WHERE status = 'published'
       AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
  )

  const entries: Array<{ loc: string; lastmod: string | undefined }> = []
  for (const doc of docs ?? []) {
    const categorySlug = categoryToSlug(doc.category as string | null)
    const slug = typeof doc.slug === 'string' ? doc.slug : ''
    if (!categorySlug || !slug) continue

    entries.push({
      loc: slug === categorySlug ? `/docs/${categorySlug}` : `/docs/${categorySlug}/${slug}`,
      lastmod: doc.updated_at as string | undefined,
    })
  }

  return entries
})
