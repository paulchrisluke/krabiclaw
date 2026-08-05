import { createError } from 'h3'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { getTenantPageForEditor, getPublishedTenantPage, listPublishedTenantPagePaths, type TenantPageDto } from '~/server/utils/tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'

export interface PublicTenantPage {
  id: string
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
  published_revision_id: string | null
  updated_at: string
}

async function hydrateBlocks(db: DbClient, siteId: string, blocks: TenantPageBlock[]): Promise<TenantPageBlock[]> {
  const assetIds = new Set<string>()
  const offeringIds = new Set<string>()
  const locationIds = new Set<string>()
  for (const block of blocks) {
    const assetId = block.data.asset_id
    if (typeof assetId === 'string' && assetId.trim()) assetIds.add(assetId)
    const assetIdsValue = block.data.asset_ids
    if (Array.isArray(assetIdsValue)) {
      for (const value of assetIdsValue) {
        if (typeof value === 'string' && value.trim()) assetIds.add(value)
      }
    }
    if (block.type === 'offering_grid' && Array.isArray(block.data.offering_ids)) {
      for (const value of block.data.offering_ids) if (typeof value === 'string' && value.trim()) offeringIds.add(value)
    }
    if (block.type === 'location_grid' && Array.isArray(block.data.location_ids)) {
      for (const value of block.data.location_ids) if (typeof value === 'string' && value.trim()) locationIds.add(value)
    }
  }
  const offerings = offeringIds.size
    ? await queryAll<{ id: string; name: string; label: string | null; summary: string | null; short_description: string | null; body: string | null; slug: string; canonical_path: string | null; thumbnail_asset_id: string | null; hero_image_asset_id: string | null; media_asset_ids: string | null }>(db, `
        SELECT id, name, label, summary, short_description, body, slug, canonical_path,
               thumbnail_asset_id, hero_image_asset_id, media_asset_ids
          FROM offerings
         WHERE site_id = ? AND status = 'published' AND id IN (${Array.from(offeringIds).map(() => '?').join(',')})
      `, [siteId, ...offeringIds])
    : []
  const locations = locationIds.size
    ? await queryAll<{ id: string; title: string; slug: string; description: string | null; short_description: string | null; hero_media_asset_id: string | null }>(db, `
        SELECT id, title, slug, description, short_description, hero_media_asset_id
          FROM business_locations
         WHERE site_id = ? AND status = 'active' AND id IN (${Array.from(locationIds).map(() => '?').join(',')})
      `, [siteId, ...locationIds])
    : []
  if (offerings.length !== offeringIds.size) throw createError({ statusCode: 500, statusMessage: 'Tenant page references an unavailable offering' })
  if (locations.length !== locationIds.size) throw createError({ statusCode: 500, statusMessage: 'Tenant page references an unavailable location' })
  for (const offering of offerings) {
    if (offering.thumbnail_asset_id) assetIds.add(offering.thumbnail_asset_id)
    if (offering.hero_image_asset_id) assetIds.add(offering.hero_image_asset_id)
    if (offering.media_asset_ids) {
      try {
        const ids = JSON.parse(offering.media_asset_ids) as unknown
        if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string' && id.trim()) assetIds.add(id)
      } catch { throw createError({ statusCode: 500, statusMessage: `Offering ${offering.id} has malformed media references` }) }
    }
  }
  for (const location of locations) if (location.hero_media_asset_id) assetIds.add(location.hero_media_asset_id)
  const rows = assetIds.size ? await queryAll<{ id: string; public_url: string | null; thumbnail_url: string | null; alt_text: string | null }>(db, `
    SELECT id, public_url, thumbnail_url, alt_text
      FROM media_assets
     WHERE site_id = ? AND status = 'active' AND id IN (${Array.from(assetIds).map(() => '?').join(',')})
  `, [siteId, ...assetIds])
    : []
  const media = new Map(rows.map(row => [row.id, row]))
  for (const id of assetIds) {
    const asset = media.get(id)
    if (!asset?.public_url) throw createError({ statusCode: 500, statusMessage: `Tenant page media asset ${id} is unavailable` })
  }
  const offeringById = new Map(offerings.map(item => [item.id, item]))
  const locationById = new Map(locations.map(item => [item.id, item]))
  return blocks.map(block => {
    const data = { ...block.data }
    const assetId = typeof data.asset_id === 'string' ? data.asset_id : null
    if (assetId) {
      const asset = media.get(assetId)
      data.url = asset?.public_url ?? null
      data.thumbnail_url = asset?.thumbnail_url ?? null
      data.asset_alt = asset?.alt_text ?? null
    }
    if (Array.isArray(data.asset_ids)) {
      data.images = data.asset_ids.map(value => {
        const asset = typeof value === 'string' ? media.get(value) : null
        if (!asset?.public_url) throw createError({ statusCode: 500, statusMessage: 'Tenant page gallery media is unavailable' })
        return { id: value, url: asset.public_url, thumbnail_url: asset.thumbnail_url, alt: asset.alt_text }
      })
    }
    if (block.type === 'offering_grid' && Array.isArray(data.offering_ids)) {
      data.items = data.offering_ids.map(id => {
        const offering = typeof id === 'string' ? offeringById.get(id) : undefined
        if (!offering) throw createError({ statusCode: 500, statusMessage: 'Tenant page offering reference is unavailable' })
        const imageId = offering.thumbnail_asset_id ?? offering.hero_image_asset_id
        return {
          id: offering.id,
          title: offering.label || offering.name,
          description: offering.summary || offering.short_description || offering.body || undefined,
          url: offering.canonical_path || `/services/${offering.slug}`,
          label: offering.label ? 'Learn more' : undefined,
          image_url: imageId ? (media.get(imageId)?.public_url ?? undefined) : undefined,
        }
      })
    }
    if (block.type === 'location_grid' && Array.isArray(data.location_ids)) {
      data.items = data.location_ids.map(id => {
        const location = typeof id === 'string' ? locationById.get(id) : undefined
        if (!location) throw createError({ statusCode: 500, statusMessage: 'Tenant page location reference is unavailable' })
        return {
          id: location.id,
          title: location.title,
          description: location.short_description || location.description || undefined,
          url: `/locations/${location.slug}`,
          label: 'View location',
          image_url: location.hero_media_asset_id ? (media.get(location.hero_media_asset_id)?.public_url ?? undefined) : undefined,
        }
      })
    }
    return { ...block, data }
  })
}

function mapPage(page: TenantPageDto, blocks: TenantPageBlock[], preview: boolean): PublicTenantPage {
  return {
    id: page.id,
    path: preview ? page.draft_path : page.published_path,
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
    published_revision_id: page.published_revision_id,
    updated_at: page.updated_at,
  }
}

export async function getPublicTenantPageForPath(
  db: DbClient,
  siteId: string,
  path: string,
  options: { locale?: string | null; preview?: boolean } = {},
): Promise<PublicTenantPage | null> {
  const page = options.preview
    ? await getTenantPageForEditor(db, await resolveVariantId(db, siteId, path, options.locale))
    : await getPublishedTenantPage(db, siteId, path, options.locale)
  if (!page) return null
  return mapPage(page, await hydrateBlocks(db, siteId, page.blocks), Boolean(options.preview))
}

async function resolveVariantId(db: DbClient, siteId: string, path: string, locale?: string | null): Promise<string> {
  const row = await queryFirst<{ id: string } | null>(db, `
    SELECT v.id
      FROM tenant_page_variants v
     WHERE v.site_id = ? AND (v.published_path = ? OR v.draft_path = ?)
       AND (? IS NULL OR v.locale = ?)
     ORDER BY v.locale ASC
     LIMIT 1
  `, [siteId, path, path, locale ?? null, locale ?? null])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Tenant page not found' })
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
