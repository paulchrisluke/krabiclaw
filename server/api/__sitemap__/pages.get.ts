// Dynamic sitemap source for tenant static pages.
// Emits the standard tenant page routes, conditionally excluding /reservations
// for pure experience-vertical sites (which redirect away from that page anyway).
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineSitemapEventHandler(async (event) => {
  if (event.context.tenantType !== TENANT_TYPES.TENANT) return []

  const siteId = event.context.siteId as string | undefined
  if (!siteId) return []

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const site = await queryFirst<{ vertical: string | null; theme_id: string | null }>(
    db,
    `SELECT vertical, theme_id FROM sites WHERE id = ?`,
    [siteId],
  )

  const template = resolvePublicTemplate({
    themeId: site?.theme_id,
    vertical: site?.vertical,
  })

  if (template.slug === 'blawby') {
    const [offerings, tenantPages] = await Promise.all([
      queryAll<{ slug: string; canonical_path: string | null; updated_at: string | null }>(db, `
        SELECT slug, canonical_path, updated_at
          FROM offerings
         WHERE site_id = ? AND status = 'published'
         ORDER BY sort_order ASC, name ASC
      `, [siteId]),
      queryAll<{ path: string; updated_at: string | null; robots: string | null }>(db, `
        SELECT path, updated_at, robots
          FROM tenant_pages
         WHERE site_id = ? AND status = 'published'
         ORDER BY sort_order ASC, title ASC
      `, [siteId]),
    ])

    const routes = new Map<string, { loc: string; lastmod?: string }>()
    for (const loc of template.sitemap.exactPaths) {
      routes.set(loc, { loc })
    }
    for (const offering of offerings ?? []) {
      const loc = offering.canonical_path || `/services/${offering.slug}`
      routes.set(loc, { loc, lastmod: offering.updated_at ?? undefined })
    }
    for (const page of tenantPages ?? []) {
      if (!page.path || /noindex/i.test(page.robots || '')) continue
      routes.set(page.path, { loc: page.path, lastmod: page.updated_at ?? undefined })
    }
    return Array.from(routes.values())
  }

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
