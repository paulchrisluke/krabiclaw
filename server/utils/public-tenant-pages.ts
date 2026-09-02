import { HTTPError } from 'nitro';
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { listPageQa, type LocationQaRow } from '~/server/utils/location-qa'
import { listSiteReviews } from '~/server/utils/site-reviews'
import { getTenantPageForEditor, getPublishedTenantPage, listPublishedTenantPagePaths, type TenantPageDto } from '~/server/utils/tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { getMediaPlacements, type MediaPlacementItem } from '~/server/utils/media-placement'

export interface PublicTenantPage {
  id: string
  page_id: string
  path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  page_type: string
  recipe: string | null
  locale: string
  blocks: TenantPageBlock[]
  
  updated_at: string
}

export interface PublicTenantPageOfferingRow {
  id: string
  name: string
  label: string | null
  summary: string | null
  short_description: string | null
  body: string | null
  slug: string
  canonical_path: string | null
  media: MediaPlacementItem[]
  sort_order: number
  featured: number
}

export interface PublicTenantPageHydrationResources {
  offerings?: Promise<PublicTenantPageOfferingRow[]>
  qaRows?: Promise<LocationQaRow[]>
}

export async function listPublicTenantPageOfferingRows(
  db: DbClient,
  siteId: string,
  offeringIds?: readonly string[],
): Promise<PublicTenantPageOfferingRow[]> {
  if (offeringIds?.length === 0) return []
  const rows = await queryAll<Omit<PublicTenantPageOfferingRow, 'media'>>(db, `
    SELECT o.id, o.name, o.label, o.summary, o.short_description, o.body, o.slug,
           o.canonical_path, o.sort_order, o.featured
      FROM offerings o
     WHERE o.site_id = ?
       ${offeringIds ? `AND o.id IN (SELECT value FROM json_each(?))` : ''}
     ORDER BY o.sort_order ASC, o.name ASC
  `, [siteId, ...(offeringIds ? [d1JsonStringSet(offeringIds)] : [])])
  const placements = await getMediaPlacements(db, { siteId, ownerType: 'offering', ownerIds: rows.map(row => row.id) })
  return rows.map(row => ({ ...row, media: placements.get(row.id) ?? [] }))
}

export function selectPublicTenantPageBlocks(blocks: TenantPageBlock[]): TenantPageBlock[] {
  return blocks.filter(block => !(block.type === 'callout' && block.data.type === 'legal_meta'))
}

async function hydrateBlocks(
  db: DbClient,
  siteId: string,
  pagePath: string,
  blocks: TenantPageBlock[],
  resources: PublicTenantPageHydrationResources = {},
): Promise<TenantPageBlock[]> {
  const publicBlocks = selectPublicTenantPageBlocks(blocks)
  const offeringIds = new Set<string>()
  const locationIds = new Set<string>()
  const hasOfferingSource = publicBlocks.some(block => block.type === 'offering_grid' && block.data.source === 'site_offerings')
  const hasQaSource = publicBlocks.some(block => block.type === 'faq' && block.data.source === 'page_qa')
  const hasReviewSource = publicBlocks.some(block => block.type === 'testimonial_grid' && block.data.source === 'site_reviews')
  const hasPostSource = publicBlocks.some(block => block.type === 'feature_grid' && block.data.source === 'site_posts')
  for (const block of publicBlocks) {
    if (block.type === 'offering_grid' && Array.isArray(block.data.offering_ids)) {
      for (const value of block.data.offering_ids) if (typeof value === 'string' && value.trim()) offeringIds.add(value)
    }
    if (block.type === 'location_grid' && Array.isArray(block.data.location_ids)) {
      for (const value of block.data.location_ids) if (typeof value === 'string' && value.trim()) locationIds.add(value)
    }
  }
  const offerings = offeringIds.size || hasOfferingSource
    ? resources.offerings
      ? (await resources.offerings).filter(offering => hasOfferingSource || offeringIds.has(offering.id))
      : await listPublicTenantPageOfferingRows(db, siteId, hasOfferingSource ? undefined : [...offeringIds])
    : []
  const locations = locationIds.size
    ? await queryAll<{ id: string; title: string; slug: string; description: string | null; short_description: string | null; asset_id: string | null; public_url: string | null; thumbnail_url: string | null; kind: string | null }>(db, `
        SELECT bl.id, bl.title, bl.slug, bl.description, bl.short_description, ma.id AS asset_id, ma.public_url, ma.thumbnail_url, ma.kind
          FROM business_locations bl
          LEFT JOIN media_placements mp ON mp.owner_type = 'business_location' AND mp.owner_id = bl.id AND mp.slot = 'hero' AND mp.sort_order = 0 AND mp.status = 'active'
          LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
         WHERE bl.site_id = ? AND bl.status = 'active' AND bl.id IN (SELECT value FROM json_each(?))
      `, [siteId, d1JsonStringSet([...locationIds])])
    : []
  const distinctLocationIds = new Set(locations.map(l => l.id))
  if (distinctLocationIds.size !== locationIds.size) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page references an unavailable location' })
  const [qaRows, reviewRows, postRows] = await Promise.all([
    hasQaSource ? (resources.qaRows ?? listPageQa(db, siteId, pagePath, true)) : Promise.resolve([]),
    hasReviewSource ? listSiteReviews(db, siteId, { publishedOnly: true }) : Promise.resolve([]),
    hasPostSource ? queryAll<{ id: string; title: string; slug: string; excerpt: string | null; canonical_url: string | null; asset_id: string | null; public_url: string | null; thumbnail_url: string | null; kind: string | null }>(db, `
      SELECT p.id, p.title, p.slug, p.excerpt, p.canonical_url, ma.id AS asset_id, ma.public_url, ma.thumbnail_url, ma.kind
        FROM blog_posts p
        LEFT JOIN media_placements mp ON mp.owner_type = 'blog_post' AND mp.owner_id = p.id AND mp.slot = 'featured' AND mp.sort_order = 0 AND mp.status = 'active'
        LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
       WHERE p.site_id = ? AND p.status = 'published' AND p.visibility = 'public'
       ORDER BY COALESCE(p.featured_order, 999999), p.published_at IS NULL, p.published_at DESC, p.id DESC
    `, [siteId]) : Promise.resolve([]),
  ])
  const offeringById = new Map(offerings.map(item => [item.id, item]))
  const selectedOfferings = new Map(Array.from(offeringIds).map(id => [id, offeringById.get(id)] as const))
  if ([...selectedOfferings.values()].some(offering => !offering)) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page references an unavailable offering' })
  const locationById = new Map(locations.map(item => [item.id, item]))
  const qaItems = qaRows.map(row => ({ id: String(row.id), title: String(row.question), description: typeof row.answer === 'string' ? row.answer : undefined }))
  const reviewItems = (reviewRows as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    title: typeof row.author_name === 'string' ? row.author_name : 'Client',
    description: typeof row.content === 'string' ? row.content : undefined,
    value: row.rating == null ? undefined : String(row.rating),
  }))
  const postItems = postRows.map(post => ({
    id: post.id,
    title: post.title,
    description: post.excerpt || undefined,
    url: post.canonical_url || `/article/${post.slug}`,
    label: 'Read more',
    media: post.asset_id ? [{ asset_id: post.asset_id, slot: 'featured', public_url: post.public_url, thumbnail_url: post.thumbnail_url, kind: post.kind }] : [],
  }))
  return publicBlocks.map(block => {
    const data = { ...block.data }
    if (block.type === 'offering_grid' && Array.isArray(data.offering_ids)) {
      data.items = data.offering_ids.map(id => {
        const offering = typeof id === 'string' ? selectedOfferings.get(id) : undefined
        if (!offering) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page offering reference is unavailable' })
        return {
          id: offering.id,
          title: offering.label || offering.name,
          description: offering.summary || offering.short_description || offering.body || undefined,
          url: offering.canonical_path || `/services/${offering.slug}`,
          label: offering.label ? 'Learn more' : undefined,
          media: offering.media,
        }
      })
    }
    if (block.type === 'location_grid' && Array.isArray(data.location_ids)) {
      data.items = data.location_ids.map(id => {
        const location = typeof id === 'string' ? locationById.get(id) : undefined
        if (!location) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page location reference is unavailable' })
        return {
          id: location.id,
          title: location.title,
          description: location.short_description || location.description || undefined,
          url: `/locations/${location.slug}`,
          label: 'View location',
          media: location.asset_id ? [{ asset_id: location.asset_id, slot: 'hero', public_url: location.public_url, thumbnail_url: location.thumbnail_url, kind: location.kind }] : [],
        }
      })
    }
    if (block.type === 'offering_grid' && data.source === 'site_offerings') {
      data.items = offerings.map(offering => {
        return {
          id: offering.id,
          title: offering.label || offering.name,
          description: offering.summary || offering.short_description || offering.body || undefined,
          url: offering.canonical_path || `/services/${offering.slug}`,
          label: 'Learn more',
          media: offering.media,
        }
      })
    }
    if (block.type === 'faq' && data.source === 'page_qa') data.items = qaItems
    if (block.type === 'testimonial_grid' && data.source === 'site_reviews') data.items = reviewItems
    if (block.type === 'feature_grid' && data.source === 'site_posts') {
      const limit = typeof data.limit === 'number' && Number.isInteger(data.limit) && data.limit > 0 ? data.limit : postItems.length
      data.items = postItems.slice(0, limit)
    }
    return { ...block, data }
  })
}

function mapPage(page: TenantPageDto, blocks: TenantPageBlock[]): PublicTenantPage {
  return {
    id: page.id,
    page_id: page.page_id,
    path: page.path,
    title: page.title,
    summary: page.summary,
    seo_title: page.seo_title,
    seo_description: page.seo_description,
    canonical_url: page.canonical_url,
    robots: page.robots,
    page_type: page.page_type,
    recipe: page.recipe,
    locale: page.locale,
    blocks,
    updated_at: page.updated_at,
  }
}

export async function getPublicTenantPageForPath(
  db: DbClient,
  siteId: string,
  path: string,
  options: {
    locale?: string | null
    preview?: boolean
    hydrationResources?: PublicTenantPageHydrationResources
  } = {},
): Promise<PublicTenantPage | null> {
  const page = options.preview
    ? await getTenantPageForEditor(db, await resolveVariantId(db, siteId, path, options.locale))
    : await getPublishedTenantPage(db, siteId, path, options.locale)
  if (!page) return null
  if (page.locale !== 'en') {
    const canonicalHydration = page.blocks.some(block =>
      (block.type === 'offering_grid' && (block.data.source === 'site_offerings' || Array.isArray(block.data.offering_ids)))
      || (block.type === 'location_grid' && Array.isArray(block.data.location_ids))
      || (block.type === 'faq' && block.data.source === 'page_qa')
      || (block.type === 'testimonial_grid' && block.data.source === 'site_reviews')
      || (block.type === 'feature_grid' && block.data.source === 'site_posts'),
    )
    if (canonicalHydration) {
      throw new HTTPError({ statusCode: 404, statusMessage: 'Exact localized embedded content is unavailable' })
    }
  }
  return mapPage(page, await hydrateBlocks(db, siteId, page.path, page.blocks, options.hydrationResources))
}

async function resolveVariantId(db: DbClient, siteId: string, path: string, locale?: string | null): Promise<string> {
  const row = await queryFirst<{ id: string } | null>(db, `
    SELECT v.id
      FROM tenant_page_variants v
     WHERE v.site_id = ? AND v.path = ?
       AND (? IS NULL OR v.locale = ?)
     ORDER BY v.locale ASC
     LIMIT 1
  `, [siteId, path, locale ?? null, locale ?? null])
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Tenant page not found' })
  return row.id
}

export async function listCanonicalTenantPages(db: DbClient, siteId: string, locale?: string | null) {
  const paths = await listPublishedTenantPagePaths(db, siteId, locale)
  const pages: PublicTenantPage[] = []
  for (const item of paths) {
    const page = await getPublicTenantPageForPath(db, siteId, item.path, { locale })
    if (page) pages.push(page)
  }
  return pages
}
