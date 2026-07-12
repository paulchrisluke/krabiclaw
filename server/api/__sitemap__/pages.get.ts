// Explicit static sitemap source for @nuxtjs/sitemap.
// Platform and tenant hosts share one Nuxt pages tree, so route discovery must be
// allowlist-based rather than inferred from files under pages/.
import { getRequestURL } from 'h3'
import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isNonIndexableHost, PLATFORM_SITEMAP_ROUTES } from '~/server/utils/seo-policy'
import { TENANT_TYPES } from '~/utils/tenant-routing'

interface TenantSitemapSummary {
  vertical: string | null
  location_count: number
  menu_item_count: number
  post_count: number
  experience_count: number
  order_link_count: number
}

export default defineSitemapEventHandler(async (event) => {
  if (isNonIndexableHost(getRequestURL(event).hostname)) return []

  if (event.context.tenantType === TENANT_TYPES.PLATFORM) {
    return PLATFORM_SITEMAP_ROUTES.map(loc => ({ loc }))
  }

  if (event.context.tenantType !== TENANT_TYPES.TENANT) return []

  const siteId = event.context.siteId as string | undefined
  if (!siteId) return []

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const summary = await queryFirst<TenantSitemapSummary>(
    db,
    `SELECT
       s.vertical,
       (SELECT COUNT(*) FROM business_locations bl
        WHERE bl.site_id = s.id
          AND bl.status = 'active'
          AND (bl.robots IS NULL OR bl.robots NOT LIKE '%noindex%')) AS location_count,
       (SELECT COUNT(*) FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        WHERE m.site_id = s.id
          AND m.status = 'published'
          AND (mi.robots IS NULL OR mi.robots NOT LIKE '%noindex%')) AS menu_item_count,
       (SELECT COUNT(*) FROM blog_posts bp
        WHERE bp.site_id = s.id
          AND bp.status = 'published'
          AND (bp.robots IS NULL OR bp.robots NOT LIKE '%noindex%')) AS post_count,
       (SELECT COUNT(*) FROM experiences e
        WHERE e.site_id = s.id
          AND e.status != 'inactive'
          AND (e.robots IS NULL OR e.robots NOT LIKE '%noindex%')) AS experience_count,
       (SELECT COUNT(*) FROM business_locations ol
        WHERE ol.site_id = s.id
          AND ol.status = 'active'
          AND (ol.grab_url IS NOT NULL OR ol.uber_eats_url IS NOT NULL OR ol.foodpanda_url IS NOT NULL)) AS order_link_count
     FROM sites s
     WHERE s.id = ? AND s.status = 'active'
     LIMIT 1`,
    [siteId],
  )

  if (!summary) return []

  const routes = [
    { loc: '/' },
    { loc: '/about' },
    { loc: '/contact' },
  ]

  if (Number(summary.location_count) > 0) {
    routes.push({ loc: '/locations' })
    if (summary.vertical !== 'experience') routes.push({ loc: '/reservations' })
  }
  if (Number(summary.menu_item_count) > 0) routes.push({ loc: '/menu' })
  if (Number(summary.post_count) > 0) routes.push({ loc: '/blog' })
  if (Number(summary.experience_count) > 0) routes.push({ loc: '/experiences' })
  if (Number(summary.order_link_count) > 0) routes.push({ loc: '/order' })

  return routes
})
