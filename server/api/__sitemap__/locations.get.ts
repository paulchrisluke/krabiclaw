// Dynamic sitemap source for @nuxtjs/sitemap.
// Emits one entry per active location on a tenant site (/locations/[slug]).
// hide_from_nav is a nav-UI-only concern and does not gate sitemap/indexing —
// robots is the correct signal for search-engine inclusion.
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineSitemapEventHandler(async (event) => {
  if (event.context.tenantType !== TENANT_TYPES.TENANT) return []

  const siteId = event.context.siteId as string | undefined
  if (!siteId) return []

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const locations = await queryAll<ApiRecord>(
    db,
    `SELECT slug, updated_at FROM business_locations WHERE site_id = ? AND status = 'active' AND (robots IS NULL OR robots NOT LIKE 'noindex%')`,
    [siteId],
  )

  return (locations ?? [])
    .filter(location => location.slug)
    .map(location => ({ loc: `/locations/${location.slug}`, lastmod: location.updated_at as string | undefined }))
})
