// Dynamic sitemap source for @nuxtjs/sitemap.
// Emits one entry per visible experience on a tenant site (/experiences/[slug]).
// Gates on status != 'inactive' rather than status = 'active' so 'sold_out'
// experiences stay in the sitemap — the page still exists and may reopen.
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

  const experiences = await queryAll<ApiRecord>(
    db,
    `SELECT slug, updated_at FROM experiences WHERE site_id = ? AND status != 'inactive' AND (robots IS NULL OR robots NOT LIKE 'noindex%')`,
    [siteId],
  )

  return (experiences ?? [])
    .filter(experience => experience.slug)
    .map(experience => ({ loc: `/experiences/${experience.slug}`, lastmod: experience.updated_at as string | undefined }))
})
