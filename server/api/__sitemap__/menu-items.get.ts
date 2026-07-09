// Dynamic sitemap source for @nuxtjs/sitemap.
// Emits one entry per menu item on a tenant site (/menu/[slug]). Does not gate
// on `available` — an item being temporarily 86'd is a transient state, not a
// removal, and excluding/re-including it from the sitemap on every stock
// change would cause needless churn. Only robots="noindex" excludes an item.
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

  const items = await queryAll<ApiRecord>(
    db,
    `SELECT mi.slug, mi.updated_at
     FROM menu_items mi
     JOIN menus m ON m.id = mi.menu_id
     WHERE m.site_id = ? AND m.status = 'published' AND (mi.robots IS NULL OR mi.robots NOT LIKE 'noindex%')`,
    [siteId],
  )

  return (items ?? [])
    .filter(item => item.slug)
    .map(item => ({ loc: `/menu/${item.slug}`, lastmod: item.updated_at as string | undefined }))
})
