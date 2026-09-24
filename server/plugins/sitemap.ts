import { isSubscriptionStateInvalid } from '~/server/utils/billing-access'
import type { SitemapUrlInput } from '#sitemap/types'

import { definePlugin, HTTPError } from 'nitro'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isNonIndexableHost, PLATFORM_SITEMAP_ROUTES } from '~/server/utils/seo-policy'
import { collectionArticlePath, isArticleCollection } from '~/utils/article-collections'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { presentationForSurface, resolveProductPresentation } from '~/utils/product-presentation'
import { assertOrganizationLanguageEntitlement } from '~/server/utils/localization'

interface SitemapEntry {
  loc: string
  lastmod?: string
}

async function listPublishedTenantSitemapPages(db: DbClient, organizationId: string) {
  return await queryAll<{ path: string | null; lastmod: string | null }>(db, `
    SELECT v.path, v.updated_at AS lastmod
      FROM content_documents v
     WHERE v.organization_id = ? AND v.kind = 'page' AND v.row_role = 'root'
     ORDER BY lastmod ASC, path ASC
  `, [organizationId])
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
      const platformOrganizationId = event.context.organizationId as string
      entries.push(...PLATFORM_SITEMAP_ROUTES.map(loc => ({ loc })))

      // KrabiClaw's marketing pages are page documents on its own organization,
      // listed from the same table as every customer's pages.
      for (const page of await listPublishedTenantSitemapPages(db, platformOrganizationId)) {
        if (!page.path) continue
        entries.push({ loc: page.path, lastmod: page.lastmod ?? undefined })
      }

      const articles = await queryAll<ApiRecord>(
        db,
        `SELECT slug, (metadata_json ->> '$.collection') AS collection, (metadata_json ->> '$.category') AS category, updated_at
         FROM content_documents
         WHERE kind = 'article' AND row_role = 'root' AND status = 'published'
           AND organization_id = ?
           AND visibility = 'listed'`,
        [platformOrganizationId],
      )

      // Blog posts and documentation are both article collections, each at its
      // own prefix and addressed by slug. Documentation used to contribute a
      // /docs/{category} entry per category as well; that URL only ever
      // resolved when some article's slug happened to equal the category slug,
      // and 404'd for every category where none did.
      for (const article of articles ?? []) {
        const slug = typeof article.slug === 'string' ? article.slug : ''
        if (!slug || !isArticleCollection(article.collection)) continue
        entries.push({
          loc: collectionArticlePath(article.collection, slug),
          lastmod: article.updated_at as string | undefined,
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

    const organizationId = event.context.organizationId as string | undefined
    if (!organizationId) {
      ctx.urls.length = 0
      return
    }

    const organization = await queryFirst<{ vertical: string | null; theme_id: string | null }>(
      db,
      `SELECT vertical, theme_id FROM organization WHERE id = ? AND status = 'active' LIMIT 1`,
      [organizationId],
    )

    if (!organization) {
      ctx.urls.length = 0
      return
    }

    const template = resolvePublicTemplate({ themeId: organization.theme_id, vertical: organization.vertical })
    const productPresentation = resolveProductPresentation(organization.vertical)

    const localizedLocales = await queryAll<{ locale: string; organization_id: string }>(db, `
      SELECT l.locale, l.organization_id
        FROM organization_locales l
       WHERE l.organization_id = ? AND l.is_source = 0 AND l.status = 'published'
       ORDER BY l.locale
    `, [organizationId])
    for (const candidate of localizedLocales) {
      try {
        await assertOrganizationLanguageEntitlement(env, db, candidate.organization_id, candidate.locale)
      } catch (error) {
        if (error instanceof HTTPError && (error.data?.code === 'LANGUAGE_ENTITLEMENT_REQUIRED' || error.data?.code === 'PLATFORM_LOCALE_UNAVAILABLE')) continue
        if (isSubscriptionStateInvalid(error)) {
          console.error('organization_subscription_state_invalid', { organizationId: candidate.organization_id, locale: candidate.locale })
          continue
        }
        throw error
      }
      const [resources, pages] = await Promise.all([
        queryAll<{ route_path: string; updated_at: string }>(db, `
          SELECT route_path, updated_at FROM resource_localizations
           WHERE organization_id = ? AND locale = ? AND route_path IS NOT NULL
           ORDER BY route_path
        `, [organizationId, candidate.locale]),
        queryAll<{ path: string; updated_at: string }>(db, `
          SELECT d.path, d.updated_at FROM content_documents d
            JOIN content_documents root ON root.id = d.root_id AND root.row_role = 'root'
           WHERE d.organization_id = ? AND d.locale = ? AND d.row_role = 'representation' AND d.path IS NOT NULL
             AND (root.kind = 'page' OR (root.kind = 'article' AND root.status = 'published' AND root.visibility = 'listed')
               OR (root.kind = 'social_post' AND root.status = 'published' AND root.visibility = 'listed'))
           ORDER BY d.path
        `, [organizationId, candidate.locale]),
      ])
      for (const resource of resources) entries.push({ loc: resource.route_path, lastmod: resource.updated_at })
      // A Product's localized route is derived from the location it is offered
      // at, so a Product offered at two locations lists both.
      if (productPresentation) {
        const localizedProducts = await queryAll<{ location_slug: string; slug: string; updated_at: string; bookable: number }>(db, `
          SELECT bl.slug AS location_slug, p.slug, rl.updated_at,
                 (SELECT COUNT(*) FROM product_booking_configs bc
                   WHERE bc.product_id = p.id AND bc.organization_id = p.organization_id) AS bookable
            FROM resource_localizations rl
            JOIN products p ON p.id = rl.resource_id AND p.organization_id = rl.organization_id AND p.active = 1
            JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
             AND pub.organization_id = rl.organization_id AND pub.published = 1
            JOIN product_locations pl ON pl.product_id = p.id AND pl.organization_id = p.organization_id
             AND pl.published = 1 AND pl.active = 1
            JOIN business_locations bl ON bl.id = pl.location_id AND bl.organization_id = rl.organization_id AND bl.status = 'active'
           WHERE rl.organization_id = ? AND rl.locale = ? AND rl.resource_type = 'product'
           ORDER BY bl.slug, p.slug
        `, [organizationId, candidate.locale])
        // An Experience's page is site-wide, so it contributes one URL however
        // many branches offer it — and none when two do, because that URL is
        // ambiguous and 404s.
        const localizedLocationCount = new Map<string, Set<string>>()
        for (const product of localizedProducts) {
          const slugs = localizedLocationCount.get(product.slug) ?? new Set<string>()
          slugs.add(product.location_slug)
          localizedLocationCount.set(product.slug, slugs)
        }
        for (const product of localizedProducts) {
          if (product.bookable > 0 && (localizedLocationCount.get(product.slug)?.size ?? 0) !== 1) continue
          const presentation = product.bookable > 0 ? presentationForSurface(organization.vertical, 'experiences') : productPresentation
          entries.push({ loc: `/${candidate.locale}${presentation.productPath(product.location_slug, product.slug)}`, lastmod: product.updated_at })
        }
      }
      for (const page of pages) {
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
        listPublishedTenantSitemapPages(db, organizationId),
        queryAll<ApiRecord>(
          db,
          `SELECT slug, updated_at
           FROM content_documents
           WHERE organization_id = ? AND kind = 'article' AND row_role = 'root' AND status = 'published'
             AND visibility = 'listed'`,
          [organizationId],
        ),
      ])

      for (const loc of template.sitemap.exactPaths) entries.push({ loc })
      for (const page of tenantPages ?? []) {
        if (!page.path) continue
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

    const [locations, products, posts, tenantPages] = await Promise.all([
      queryAll<ApiRecord>(
        db,
        `SELECT id, slug, updated_at
         FROM business_locations
         WHERE organization_id = ?
           AND status = 'active'`,
        [organizationId],
      ),
      queryAll<ApiRecord>(
        db,
        `SELECT p.id, p.slug, pl.location_id, bl.slug AS location_slug, p.updated_at,
                (SELECT COUNT(*) FROM product_booking_configs bc
                  WHERE bc.product_id = p.id AND bc.organization_id = p.organization_id) AS bookable
         FROM products p
         JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id AND pub.published = 1
         JOIN product_locations pl ON pl.product_id = p.id AND pl.organization_id = p.organization_id AND pl.published = 1 AND pl.active = 1
         JOIN business_locations bl
           ON bl.id = pl.location_id
          AND bl.organization_id = pub.organization_id
          AND bl.status = 'active'
          AND pub.organization_id = ?
         WHERE p.active = 1
         ORDER BY pl.location_id, p.name, p.id`,
        [organizationId],
      ),
      queryAll<ApiRecord>(
        db,
        `SELECT slug, updated_at
         FROM content_documents
         WHERE organization_id = ? AND kind = 'article' AND row_role = 'root'
           AND status = 'published'
           AND visibility = 'listed'`,
        [organizationId],
      ),
      listPublishedTenantSitemapPages(db, organizationId),
    ])

    entries.push({ loc: '/' }, { loc: '/about' }, { loc: '/contact' })

    if (locations.length > 0) {
      entries.push({ loc: '/locations' })
      if (organization.vertical !== 'experience') entries.push({ loc: '/reservations' })
    }
    // A Product takes bookings, so it is an Experience, or it belongs to the
    // vertical's own surface. Both surfaces exist side by side: a restaurant
    // keeps /menu and gains /experiences.
    const isBookable = (product: ApiRecord) => Number(product.bookable ?? 0) > 0
    const bookableProducts = products.filter(isBookable)
    const surfaceProducts = products.filter(product => !isBookable(product))
    if (productPresentation && surfaceProducts.length > 0) entries.push({ loc: productPresentation.collectionPath })
    if (productPresentation && bookableProducts.length > 0) entries.push({ loc: presentationForSurface(organization.vertical, 'experiences').collectionPath })
    if (posts.length > 0) entries.push({ loc: '/blog' })

    const countByLocation = (rows: ApiRecord[]) => {
      const counts = new Map<string, number>()
      for (const product of rows ?? []) {
        const locationId = typeof product.location_id === 'string' ? product.location_id : ''
        if (!locationId) continue
        counts.set(locationId, (counts.get(locationId) ?? 0) + 1)
      }
      return counts
    }
    const visibleProductCountsByLocation = countByLocation(surfaceProducts)
    const bookableCountsByLocation = countByLocation(bookableProducts)
    // An Experience's own page is site-wide: it is listed once, and only when a
    // single branch offers it — two make /experiences/<slug> ambiguous, and it
    // 404s rather than choosing one.
    const branchesOfferingProduct = new Map<string, Set<string>>()
    for (const product of bookableProducts) {
      const slug = typeof product.slug === 'string' ? product.slug : ''
      const locationSlug = typeof product.location_slug === 'string' ? product.location_slug : ''
      if (!slug || !locationSlug) continue
      const branches = branchesOfferingProduct.get(slug) ?? new Set<string>()
      branches.add(locationSlug)
      branchesOfferingProduct.set(slug, branches)
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
        ? locations
            .filter(location => location.slug && typeof location.id === 'string' && (bookableCountsByLocation.get(location.id) ?? 0) > 0)
            .map(location => ({
              loc: `/locations/${location.slug}/${presentationForSurface(organization.vertical, 'experiences').locationCollectionSegment}`,
              lastmod: location.updated_at as string | undefined,
            }))
        : []),
      ...(productPresentation
        ? products
            .filter(product => product.slug && product.location_slug)
            .filter(product => !isBookable(product) || (branchesOfferingProduct.get(String(product.slug))?.size ?? 0) === 1)
            .map(product => ({
              loc: (isBookable(product) ? presentationForSurface(organization.vertical, 'experiences') : productPresentation)
                .productPath(String(product.location_slug), String(product.slug)),
              lastmod: product.updated_at as string | undefined,
            }))
        : []),
      ...posts
        .filter(post => post.slug)
        .map(post => ({ loc: `/blog/${post.slug}`, lastmod: post.updated_at as string | undefined })),
      ...tenantPages
        .filter(page => page.path)
        .map(page => ({ loc: page.path as string, lastmod: page.lastmod ?? undefined })),
    )

    ctx.urls.length = 0
    addUniqueEntries(ctx.urls, entries)
  })
})
