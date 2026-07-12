// Dynamic sitemap source for visible tenant experiences.
// Sold-out experiences remain indexable; inactive or noindex experiences do not.
import { getRequestURL } from 'h3'
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isNonIndexableHost } from '~/server/utils/seo-policy'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineSitemapEventHandler(async (event) => {
  if (isNonIndexableHost(getRequestURL(event).hostname)) return []
  if (event.context.tenantType !== TENANT_TYPES.TENANT) return []

  const siteId = event.context.siteId as string | undefined
  if (!siteId) return []

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const experiences = await queryAll<ApiRecord>(
    db,
    `SELECT slug, updated_at FROM experiences WHERE site_id = ? AND status != 'inactive' AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
    [siteId],
  )

  return (experiences ?? [])
    .filter(experience => experience.slug)
    .map(experience => ({ loc: `/experiences/${experience.slug}`, lastmod: experience.updated_at as string | undefined }))
})
