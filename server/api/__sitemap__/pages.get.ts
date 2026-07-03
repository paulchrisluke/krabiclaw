// Dynamic sitemap source for tenant static pages.
// Emits the standard tenant page routes, conditionally excluding /reservations
// for pure experience-vertical sites (which redirect away from that page anyway).
import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineSitemapEventHandler(async (event) => {
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

  // Static routes that all tenant sites expose
  const routes = [
    { loc: '/' },
    { loc: '/menu' },
    { loc: '/contact' },
    { loc: '/blog' },
    { loc: '/experiences' },
    { loc: '/locations' },
  ]

  // /reservations is only meaningful for non-experience verticals
  if (!isExperienceSite) {
    routes.push({ loc: '/reservations' })
  }

  return routes
})
