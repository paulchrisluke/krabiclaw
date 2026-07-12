// Dynamic sitemap source for tenant menu items.
// Temporary availability does not remove an item; robots="noindex" does.
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

  const items = await queryAll<ApiRecord>(
    db,
    `SELECT mi.slug, mi.updated_at
     FROM menu_items mi
     JOIN menus m ON m.id = mi.menu_id
     WHERE m.site_id = ? AND m.status = 'published' AND (mi.robots IS NULL OR mi.robots NOT LIKE '%noindex%')`,
    [siteId],
  )

  return (items ?? [])
    .filter(item => item.slug)
    .map(item => ({ loc: `/menu/${item.slug}`, lastmod: item.updated_at as string | undefined }))
})
