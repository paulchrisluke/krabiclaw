import type { SitemapUrlInput } from '#sitemap/types'

import { definePlugin } from 'nitro';
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isNonIndexableHost, PLATFORM_SITEMAP_ROUTES } from '~/server/utils/seo-policy'
import { blogCategoryToSlug } from '~/utils/blog-categories'
import { categoryToSlug } from '~/utils/docs-categories'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { resolveProductPresentation } from '~/utils/product-presentation'
import { assertSiteLanguageEntitlement } from '~/server/utils/localization'
import { PLATFORM_SITE_ID } from '~/shared/platform-scope'

interface SitemapEntry {
  loc: string
  lastmod?: string
}

async function listPublishedTenantSitemapPages(db: DbClient, siteId: string) {
  return await queryAll<{ path: string | null; lastmod: string | null; robots: string | null }>(db, `
    SELECT v.path, v.updated_at AS lastmod, v.robots
      FROM tenant_page_variants v
     WHERE v.site_id = ?
     ORDER BY lastmod ASC, path ASC
  `, [siteId])
}

function addUniqueEntries(target: SitemapUrlInput[], entries: SitemapEntry[]) {
  const existing = new Set(target.map(entry => typeof entry === 'string' ? entry : entry.loc))
  for (const entry of entries) {
    if (!entry.loc || existing.has(entry.loc)) continue
    existing.add(entry.loc)
    target.push(entry)
  }
}

export default definePlugin((nitroApp) => {
  // Runtime endpoint sources are intentionally discarded. They are fetched as
  // synthetic internal requests, which do not inherit the original tenant
  // context or Cloudflare bindings. The input hook below works on the real
  // sitemap request event and can query the correct tenant database directly.
  nitroApp.hooks.hook('sitemap:sources', (ctx) => {
    ctx.sources = []
  })

  nitroApp.hooks.hook('sitemap:input', async (ctx) => {
    const event = ctx.event
    const hostname = event.url.hostname
    if (isNonIndexableHost(hostname)) {
      ctx.urls.length = 0
      return
    }

    const env = cloudflareEnv(event)
    const db = env.db
    if (!db) {
      ctx.urls.length = 0
      return
    }

    const entries: SitemapEntry[] = []

    if (event.context.tenantType === TENANT_TYPES.PLATFORM) {
      entries.push(...PLATFORM_SITEMAP_ROUTES.map(loc => ({ loc })))

      const [docs, posts] = await Promise.all([
        queryAll<ApiRecord>(
          db,
          `SELECT slug, category, updated_at
           FROM platform_docs
           WHERE robots IS NULL OR robots NOT LIKE '%noindex%'`,
        ),
        queryAll<ApiRecord>(
          db,
          `SELECT slug, category, updated_at
           FROM blog_posts
           WHERE (scheduled_for IS NULL OR scheduled_for <= datetime('now'))
             AND site_id = '${PLATFORM_SITE_ID}'
             AND visibility = 'public'
             AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
        ),
      ])

      for (const doc of docs ?? []) {
        const categorySlug = categoryToSlug(doc.category as string | null)
        const slug = typeof doc.slug === 'string' ? doc.slug : ''
        if (!categorySlug || !slug) continue
        entries.push({
          loc: slug === categorySlug ? `/docs/${categorySlug}` : `/docs/${categorySlug}/${slug}`,
          lastmod: doc.updated_at as string | undefined,
        })
      }

      for (const post of posts ?? []) {
        const categorySlug = blogCategoryToSlug(post.category as string | null)
        const slug = typeof post.slug === 'string' ? post.slug : ''
        if (!categorySlug || !slug) continue
        entries.push({
          loc: `/blog/${categorySlug}/${slug}`,
          lastmod: post.updated_at as string | undefined,
        })
      }

      ctx.urls.length = 0
      addUniqueEntries(ctx.urls, entries)
      return
    }

    if (event.context.tenantType !== TENANT_TYPES.TENANT) {
      ctx.urls.length = 0
      return
    }

    const siteId = event.context.siteId as string | undefined
    if (!siteId) {
      ctx.urls.length = 0
      return
    }

    const site = await queryFirst<{ vertical: string | null; theme_id: string | null }>(
      db,
      `SELECT vertical, theme_id FROM sites WHERE id = ? AND status = 'active' LIMIT 1`,
      [siteId],
    )

    if (!site) {
      ctx.urls.length = 0
      return
    }

    const template = resolvePublicTemplate({ themeId: site.theme_id, vertical: site.vertical })

    const localizedLocales = await queryAll<{ locale: string; organization_id: string }>(db, `
      SELECT l.locale, l.organization_id
        FROM site_language_licenses l
       WHERE l.site_id = ? AND l.status = 'active'
       ORDER BY l.locale
    `, [siteId])
    for (const candidate of localizedLocales) {
      try {
        await assertSiteLanguageEntitlement(db, candidate.organization_id, siteId, candidate.locale)
      } catch {
        continue
      }
      const [resources, pages] = await Promise.all([
        queryAll<{ route_path: string; updated_at: number }>(db, `
          SELECT route_path, updated_at FROM resource_localizations
           WHERE site_id = ? AND locale = ? AND route_path IS NOT NULL
           ORDER BY route_path
        `, [siteId, candidate.locale]),
        queryAll<{ path: string; updated_at: string; robots: string | null }>(db, `
          SELECT path, updated_at, robots FROM tenant_page_variants
           WHERE site_id = ? AND locale = ?
           ORDER BY path
        `, [siteId, candidate.locale]),
      ])
      for (const resource of resources) entries.push({ loc: resource.route_path, lastmod: new Date(resource.updated_at * 1000).toISOString() })
      for (const page of pages) {
        if (/noindex/i.test(page.robots || '')) continue
        const localizedPath = page.path === '/' ? `/${candidate.locale}` : `/${candidate.locale}${page.path}`
        entries.push({ loc: localizedPath, lastmod: page.updated_at })
      }
    }

    // Blawby/professional-services sites have a different route surface
    // (offerings, tenant CMS pages, /article/ instead of /blog/) than the
    // Saya restaurant/experience template below — kept as a separate branch
    // rather than threading template-specific conditionals through the
    // Saya-oriented queries.
    if (template.slug === 'blawby') {
      const [offerings, tenantPages, posts] = await Promise.all([
        queryAll<{ slug: string; canonical_path: string | null; updated_at: string | null }>(db, `
          SELECT slug, canonical_path, updated_at
            FROM offerings
           WHERE site_id = ?
           ORDER BY sort_order ASC, name ASC
        `, [siteId]),
        listPublishedTenantSitemapPages(db, siteId),
        queryAll<ApiRecord>(
          db,
          `SELECT slug, updated_at
           FROM blog_posts
           WHERE site_id = ?
             AND (scheduled_for IS NULL OR scheduled_for <= datetime('now'))
             AND visibility = 'public'
             AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
          [siteId],
        ),
      ])

      for (const loc of template.sitemap.exactPaths) entries.push({ loc })
      for (const offering of offerings ?? []) {
        entries.push({
          loc: offering.canonical_path || `${template.serviceRoutes.offeringDetailPrefix}/${offering.slug}`,
          lastmod: offering.updated_at ?? undefined,
        })
      }
      for (const page of tenantPages ?? []) {
        if (!page.path || /noindex/i.test(page.robots || '')) continue
        entries.push({ loc: page.path, lastmod: page.lastmod ?? undefined })
      }
      for (const post of posts ?? []) {
        if (!post.slug) continue
        entries.push({
          loc: `${template.serviceRoutes.articleDetailPrefix}/${post.slug}`,
          lastmod: post.updated_at as string | undefined,
        })
      }

      ctx.urls.length = 0
      addUniqueEntries(ctx.urls, entries)
      return
    }

    const productPresentation = resolveProductPresentation(site.vertical)
    const [locations, products, posts, experiences, tenantPages] = await Promise.all([
      queryAll<ApiRecord>(
        db,
        `SELECT id, slug, updated_at, grab_url, uber_eats_url, foodpanda_url
         FROM business_locations
         WHERE site_id = ?
           AND status = 'active'
           AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
        [siteId],
      ),
      queryAll<ApiRecord>(
        db,
        `SELECT p.slug, p.location_id, bl.slug AS location_slug, p.updated_at
         FROM products p
         JOIN business_locations bl
           ON bl.id = p.location_id
          AND bl.organization_id = p.organization_id
          AND bl.site_id = p.site_id
          AND bl.status = 'active'
         WHERE p.site_id = ?
           AND p.is_visible = 1
           AND (p.robots IS NULL OR p.robots NOT LIKE '%noindex%')
         ORDER BY p.location_id, p.sort_order, p.id`,
        [siteId],
      ),
      queryAll<ApiRecord>(
        db,
        `SELECT slug, updated_at
         FROM blog_posts
         WHERE site_id = ?
           AND status = 'published'
           AND visibility = 'public'
           AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
        [siteId],
      ),
      queryAll<ApiRecord>(
        db,
        `SELECT slug, location_id, updated_at
         FROM experiences
         WHERE site_id = ?
           AND status != 'inactive'
           AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
        [siteId],
      ),
      listPublishedTenantSitemapPages(db, siteId),
    ])

    entries.push({ loc: '/' }, { loc: '/about' }, { loc: '/contact' })

    if (locations.length > 0) {
      entries.push({ loc: '/locations' })
      if (site.vertical !== 'experience') entries.push({ loc: '/reservations' })
    }
    if (productPresentation && products.length > 0) entries.push({ loc: productPresentation.collectionPath })
    if (posts.length > 0) entries.push({ loc: '/blog' })
    if (experiences.length > 0) entries.push({ loc: '/experiences' })
    if (locations.some(location => location.grab_url || location.uber_eats_url || location.foodpanda_url)) {
      entries.push({ loc: '/order' })
    }

    const visibleExperienceCountsByLocation = new Map<string, number>()
    for (const experience of experiences ?? []) {
      const locationId = typeof experience.location_id === 'string' ? experience.location_id : ''
      if (!locationId) continue
      visibleExperienceCountsByLocation.set(
        locationId,
        (visibleExperienceCountsByLocation.get(locationId) ?? 0) + 1,
      )
    }

    const visibleProductCountsByLocation = new Map<string, number>()
    for (const product of products ?? []) {
      const locationId = typeof product.location_id === 'string' ? product.location_id : ''
      if (!locationId) continue
      visibleProductCountsByLocation.set(locationId, (visibleProductCountsByLocation.get(locationId) ?? 0) + 1)
    }

    entries.push(
      ...locations
        .filter(location => location.slug)
        .map(location => ({ loc: `/locations/${location.slug}`, lastmod: location.updated_at as string | undefined })),
      ...locations
        .filter(location =>
          location.slug &&
          typeof location.id === 'string' &&
          (visibleExperienceCountsByLocation.get(location.id) ?? 0) >= 2
        )
        .map(location => ({
          loc: `/locations/${location.slug}/experiences`,
          lastmod: location.updated_at as string | undefined,
        })),
      ...(productPresentation
        ? locations
            .filter(location => location.slug && typeof location.id === 'string' && (visibleProductCountsByLocation.get(location.id) ?? 0) > 0)
            .map(location => ({
              loc: `/locations/${location.slug}/${productPresentation.locationCollectionSegment}`,
              lastmod: location.updated_at as string | undefined,
            }))
        : []),
      ...(productPresentation
        ? products
            .filter(product => product.slug && product.location_slug)
            .map(product => ({
              loc: productPresentation.productPath(String(product.location_slug), String(product.slug)),
              lastmod: product.updated_at as string | undefined,
            }))
        : []),
      ...posts
        .filter(post => post.slug)
        .map(post => ({ loc: `/blog/${post.slug}`, lastmod: post.updated_at as string | undefined })),
      ...experiences
        .filter(experience => experience.slug)
        .map(experience => ({ loc: `/experiences/${experience.slug}`, lastmod: experience.updated_at as string | undefined })),
      ...tenantPages
        .filter(page => page.path && !/noindex/i.test(page.robots || ''))
        .map(page => ({ loc: page.path as string, lastmod: page.lastmod ?? undefined })),
    )

    ctx.urls.length = 0
    addUniqueEntries(ctx.urls, entries)
  })
})
