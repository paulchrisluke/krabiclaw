import { defineEventHandler, getRequestURL, setHeader } from 'h3'
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { blogCategoryToSlug } from '~/utils/blog-categories'
import { categoryToSlug } from '~/utils/docs-categories'
import {
  absoluteSeoUrl,
  escapeXml,
  isNonIndexableHost,
  isPlatformSeoRequest,
  isTenantSeoRequest,
  PLATFORM_SITEMAP_ROUTES,
  type SeoSitemapEntry,
} from '~/server/utils/seo-policy'

function normalizeLastmod(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function renderSitemap(event: Parameters<typeof defineEventHandler>[0] extends (event: infer T) => unknown ? T : never, entries: SeoSitemapEntry[]) {
  const unique = new Map<string, SeoSitemapEntry>()
  for (const entry of entries) {
    if (!entry.loc) continue
    unique.set(entry.loc, entry)
  }

  const urls = Array.from(unique.values())
    .sort((a, b) => a.loc.localeCompare(b.loc))
    .map((entry) => {
      const loc = escapeXml(absoluteSeoUrl(event, entry.loc))
      const lastmod = normalizeLastmod(entry.lastmod)
      return lastmod
        ? `  <url><loc>${loc}</loc><lastmod>${escapeXml(lastmod)}</lastmod></url>`
        : `  <url><loc>${loc}</loc></url>`
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n')
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=300, s-maxage=300')

  const requestUrl = getRequestURL(event)
  if (isNonIndexableHost(requestUrl.hostname)) return renderSitemap(event, [])

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return renderSitemap(event, [])

  const entries: SeoSitemapEntry[] = []

  if (isPlatformSeoRequest(event)) {
    entries.push(...PLATFORM_SITEMAP_ROUTES.map(loc => ({ loc })))

    const docs = await queryAll<ApiRecord>(
      db,
      `SELECT slug, category, updated_at
       FROM platform_docs
       WHERE status = 'published'
         AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
    )

    for (const doc of docs ?? []) {
      const categorySlug = categoryToSlug(doc.category as string | null)
      const slug = typeof doc.slug === 'string' ? doc.slug : ''
      if (!categorySlug || !slug) continue
      entries.push({
        loc: slug === categorySlug ? `/docs/${categorySlug}` : `/docs/${categorySlug}/${slug}`,
        lastmod: doc.updated_at as string | undefined,
      })
    }

    const posts = await queryAll<ApiRecord>(
      db,
      `SELECT slug, category, updated_at
       FROM blog_posts
       WHERE status = 'published'
         AND site_id IS NULL
         AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
    )

    for (const post of posts ?? []) {
      const categorySlug = blogCategoryToSlug(post.category as string | null)
      const slug = typeof post.slug === 'string' ? post.slug : ''
      if (!categorySlug || !slug) continue
      entries.push({ loc: `/blog/${categorySlug}/${slug}`, lastmod: post.updated_at as string | undefined })
    }

    return renderSitemap(event, entries)
  }

  if (!isTenantSeoRequest(event)) return renderSitemap(event, [])

  const siteId = event.context.siteId as string | undefined
  if (!siteId) return renderSitemap(event, [])

  const site = await queryFirst<{ vertical: string | null }>(
    db,
    `SELECT vertical FROM sites WHERE id = ? AND status = 'active' LIMIT 1`,
    [siteId],
  )

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
       WHERE status = 'published'
         AND site_id = ?
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

  if (locations.length) {
    entries.push({ loc: '/locations' })
    if (site?.vertical !== 'experience') entries.push({ loc: '/reservations' })
  }
  if (menuItems.length) entries.push({ loc: '/menu' })
  if (posts.length) entries.push({ loc: '/blog' })
  if (experiences.length) entries.push({ loc: '/experiences' })
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

  return renderSitemap(event, entries)
})
