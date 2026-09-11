import type { SitemapUrlInput } from '#sitemap/types'

import { definePlugin, HTTPError } from 'nitro'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isNonIndexableHost, PLATFORM_SITEMAP_ROUTES } from '~/server/utils/seo-policy'
import { ARTICLE_COLLECTIONS, articleCategoryToSlug, collectionArticlePath, isArticleCollection } from '~/utils/article-collections'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { resolveProductPresentation } from '~/utils/product-presentation'
import { assertSiteLanguageEntitlement } from '~/server/utils/localization'

interface SitemapEntry {
  loc: string
  lastmod?: string
}

async function listPublishedTenantSitemapPages(db: DbClient, siteId: string) {
  return await queryAll<{ path: string | null; lastmod: string | null; robots: string | null }>(db, `
    SELECT v.path, v.updated_at AS lastmod, v.robots
      FROM content_documents v
     WHERE v.site_id = ? AND v.kind = 'page' AND v.row_role = 'root'
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
      const platformSiteId = event.context.siteId as string
      entries.push(...PLATFORM_SITEMAP_ROUTES.map(loc => ({ loc })))

      const articles = await queryAll<ApiRecord>(
        db,
        `SELECT slug, (metadata_json ->> '$.collection') AS collection, (metadata_json ->> '$.category') AS category, updated_at
         FROM content_documents
         WHERE kind = 'article' AND row_role = 'root' AND status = 'published'
           AND site_id = ?
           AND visibility = 'public'
           AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
        [platformSiteId],
      )

      // Blog posts and documentation are both article collections; each shapes its own URL.
      // A documentation category also answers at /docs/{category} — as its landing
      // article when one exists, otherwise as the category's index (see
      // pages/docs/[...segments].vue) — so every category holding a published
      // article contributes that URL too. Duplicates collapse in addUniqueEntries.
      const docsCategoryLastmod = new Map<string, string | undefined>()
      for (const article of articles ?? []) {
        const slug = typeof article.slug === 'string' ? article.slug : ''
        if (!slug || !isArticleCollection(article.collection)) continue
        const categorySlug = articleCategoryToSlug(article.collection, article.category as string | null)
        if (!categorySlug) continue
        const lastmod = article.updated_at as string | undefined
        entries.push({
          loc: collectionArticlePath(article.collection, article.category as string | null, slug),
          lastmod,
        })
        if (article.collection !== 'docs') continue
        const known = docsCategoryLastmod.get(categorySlug)
        if (!known || (lastmod && lastmod > known)) docsCategoryLastmod.set(categorySlug, lastmod)
      }
      for (const [categorySlug, lastmod] of docsCategoryLastmod) {
        entries.push({ loc: `${ARTICLE_COLLECTIONS.docs.pathPrefix}/${categorySlug}`, lastmod })
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
        FROM site_locales l
       WHERE l.site_id = ? AND l.is_source = 0 AND l.status = 'published'
       ORDER BY l.locale
    `, [siteId])
    for (const candidate of localizedLocales) {
      try {
        await assertSiteLanguageEntitlement(db, candidate.organization_id, siteId, candidate.locale)
      } catch (error) {
        if (error instanceof HTTPError && (error.data?.code === 'LANGUAGE_ENTITLEMENT_REQUIRED' || error.data?.code === 'PLATFORM_LOCALE_UNAVAILABLE')) continue
        throw error
      }
      const [resources, pages] = await Promise.all([
        queryAll<{ route_path: string; updated_at: string }>(db, `
          SELECT route_path, updated_at FROM resource_localizations
           WHERE site_id = ? AND locale = ? AND route_path IS NOT NULL
           ORDER BY route_path
        `, [siteId, candidate.locale]),
        queryAll<{ path: string; updated_at: string; robots: string | null }>(db, `
          SELECT d.path, d.updated_at, d.robots FROM content_documents d
            JOIN content_documents root ON root.id = d.root_id AND root.row_role = 'root'
           WHERE d.site_id = ? AND d.locale = ? AND d.row_role = 'representation' AND d.path IS NOT NULL
             AND (root.robots IS NULL OR root.robots NOT LIKE '%noindex%')
             AND (root.kind = 'page' OR (root.kind = 'article' AND root.status = 'published' AND root.visibility = 'public')
               OR (root.kind = 'social_post' AND root.status = 'published' AND root.visibility = 'public'))
           ORDER BY d.path
        `, [siteId, candidate.locale]),
      ])
      for (const resource of resources) entries.push({ loc: resource.route_path, lastmod: resource.updated_at })
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
      // Practice areas are pages, so they are already in the page list. There
      // is no separate offering query, and no canonical_path to prefer over
      // the route the document actually publishes at.
      const [tenantPages, posts] = await Promise.all([
        listPublishedTenantSitemapPages(db, siteId),
        queryAll<ApiRecord>(
          db,
          `SELECT slug, updated_at
           FROM content_documents
           WHERE site_id = ? AND kind = 'article' AND row_role = 'root' AND status = 'published'
             AND visibility = 'public'
             AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
          [siteId],
        ),
      ])

      for (const loc of template.sitemap.exactPaths) entries.push({ loc })
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
    const [locations, products, posts, tenantPages] = await Promise.all([
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
         JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id AND pub.published = 1
         JOIN product_locations pl ON pl.product_id = p.id AND pl.organization_id = p.organization_id AND pl.published = 1 AND pl.active = 1
         JOIN business_locations bl
           ON bl.id = pl.location_id
          AND bl.site_id = pub.site_id
          AND bl.status = 'active'
          AND pub.site_id = ?
         WHERE p.active = 1
         ORDER BY pl.location_id, p.name, p.id`,
        [siteId],
      ),
      queryAll<ApiRecord>(
        db,
        `SELECT slug, updated_at
         FROM content_documents
         WHERE site_id = ? AND kind = 'article' AND row_role = 'root'
           AND status = 'published'
           AND visibility = 'public'
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
    if (locations.some(location => location.grab_url || location.uber_eats_url || location.foodpanda_url)) {
      entries.push({ loc: '/order' })
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
      ...tenantPages
        .filter(page => page.path && !/noindex/i.test(page.robots || ''))
        .map(page => ({ loc: page.path as string, lastmod: page.lastmod ?? undefined })),
    )

    ctx.urls.length = 0
    addUniqueEntries(ctx.urls, entries)
  })
})
