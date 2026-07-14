import type { SitemapUrlInput } from '#sitemap/types'
import { getRequestURL } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isNonIndexableHost, PLATFORM_SITEMAP_ROUTES } from '~/server/utils/seo-policy'
import { blogCategoryToSlug } from '~/utils/blog-categories'
import { categoryToSlug } from '~/utils/docs-categories'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { resolvePublicTemplate } from '~/utils/template-registry'

interface SitemapEntry {
  loc: string
  lastmod?: string
}

function addUniqueEntries(target: SitemapUrlInput[], entries: SitemapEntry[]) {
  const existing = new Set(target.map(entry => typeof entry === 'string' ? entry : entry.loc))
  for (const entry of entries) {
    if (!entry.loc || existing.has(entry.loc)) continue
    existing.add(entry.loc)
    target.push(entry)
  }
}

export default defineNitroPlugin((nitroApp) => {
  // Runtime endpoint sources are intentionally discarded. They are fetched as
  // synthetic internal requests, which do not inherit the original tenant
  // context or Cloudflare bindings. The input hook below works on the real
  // sitemap request event and can query the correct tenant database directly.
  nitroApp.hooks.hook('sitemap:sources', (ctx) => {
    ctx.sources = []
  })

  nitroApp.hooks.hook('sitemap:input', async (ctx) => {
    const event = ctx.event
    const hostname = getRequestURL(event).hostname
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
           WHERE status = 'published'
             AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
        ),
        queryAll<ApiRecord>(
          db,
          `SELECT slug, category, updated_at
           FROM blog_posts
           WHERE status = 'published'
             AND site_id IS NULL
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
           WHERE site_id = ? AND status = 'published'
           ORDER BY sort_order ASC, name ASC
        `, [siteId]),
        queryAll<{ path: string; updated_at: string | null; robots: string | null }>(db, `
          SELECT path, updated_at, robots
            FROM tenant_pages
           WHERE site_id = ? AND status = 'published'
           ORDER BY sort_order ASC, title ASC
        `, [siteId]),
        queryAll<ApiRecord>(
          db,
          `SELECT slug, updated_at
           FROM blog_posts
           WHERE site_id = ?
             AND status = 'published'
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
        entries.push({ loc: page.path, lastmod: page.updated_at ?? undefined })
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

    const [locations, menuItems, posts, experiences] = await Promise.all([
      queryAll<ApiRecord>(
        db,
        `SELECT slug, updated_at, grab_url, uber_eats_url, foodpanda_url
         FROM business_locations
         WHERE site_id = ?
           AND status = 'active'
           AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
        [siteId],
      ),
      queryAll<ApiRecord>(
        db,
        `SELECT mi.slug, mi.updated_at
         FROM menu_items mi
         JOIN menus m ON m.id = mi.menu_id
         WHERE m.site_id = ?
           AND m.status = 'published'
           AND (mi.robots IS NULL OR mi.robots NOT LIKE '%noindex%')`,
        [siteId],
      ),
      queryAll<ApiRecord>(
        db,
        `SELECT slug, updated_at
         FROM blog_posts
         WHERE site_id = ?
           AND status = 'published'
           AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
        [siteId],
      ),
      queryAll<ApiRecord>(
        db,
        `SELECT slug, updated_at
         FROM experiences
         WHERE site_id = ?
           AND status != 'inactive'
           AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
        [siteId],
      ),
    ])

    entries.push({ loc: '/' }, { loc: '/about' }, { loc: '/contact' })

    if (locations.length > 0) {
      entries.push({ loc: '/locations' })
      if (site.vertical !== 'experience') entries.push({ loc: '/reservations' })
    }
    if (menuItems.length > 0) entries.push({ loc: '/menu' })
    if (posts.length > 0) entries.push({ loc: '/blog' })
    if (experiences.length > 0) entries.push({ loc: '/experiences' })
    if (locations.some(location => location.grab_url || location.uber_eats_url || location.foodpanda_url)) {
      entries.push({ loc: '/order' })
    }

    entries.push(
      ...locations
        .filter(location => location.slug)
        .map(location => ({ loc: `/locations/${location.slug}`, lastmod: location.updated_at as string | undefined })),
      ...menuItems
        .filter(item => item.slug)
        .map(item => ({ loc: `/menu/${item.slug}`, lastmod: item.updated_at as string | undefined })),
      ...posts
        .filter(post => post.slug)
        .map(post => ({ loc: `/blog/${post.slug}`, lastmod: post.updated_at as string | undefined })),
      ...experiences
        .filter(experience => experience.slug)
        .map(experience => ({ loc: `/experiences/${experience.slug}`, lastmod: experience.updated_at as string | undefined })),
    )

    ctx.urls.length = 0
    addUniqueEntries(ctx.urls, entries)
  })
})
