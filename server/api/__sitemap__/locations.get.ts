// Dynamic sitemap source for active tenant locations.
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

  const locations = await queryAll<ApiRecord>(
    db,
    `SELECT slug, updated_at FROM business_locations WHERE site_id = ? AND status = 'active' AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
    [siteId],
  )

  return (locations ?? [])
    .filter(location => location.slug)
    .map(location => ({ loc: `/locations/${location.slug}`, lastmod: location.updated_at as string | undefined }))
})
