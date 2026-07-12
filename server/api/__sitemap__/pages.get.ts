// Explicit static sitemap source for @nuxtjs/sitemap.
// Platform and tenant hosts share one Nuxt pages tree, so route discovery must be
// allowlist-based rather than inferred from files under pages/.
import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { PLATFORM_SITEMAP_ROUTES } from '~/server/utils/seo-policy'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineSitemapEventHandler(async (event) => {
  if (event.context.tenantType === TENANT_TYPES.PLATFORM) {
    return PLATFORM_SITEMAP_ROUTES.map(loc => ({ loc }))
  }

  if (event.context.tenantType !== TENANT_TYPES.TENANT) return []

  const siteId = event.context.siteId as string | undefined
  if (!siteId) return []

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const site = await queryFirst<{ vertical: string | null }>(
    db,
    `SELECT vertical FROM sites WHERE id = ?`,
    [siteId],
  )

  const isExperienceSite = site?.vertical === 'experience'
  const routes = [
    { loc: '/' },
    { loc: '/about' },
    { loc: '/contact' },
    { loc: '/menu' },
    { loc: '/blog' },
    { loc: '/experiences' },
    { loc: '/locations' },
  ]

  if (!isExperienceSite) routes.push({ loc: '/reservations' })

  return routes
})
