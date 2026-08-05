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
  for (const block of blocks) {
    const assetId = block.data.asset_id
    if (typeof assetId === 'string' && assetId.trim()) assetIds.add(assetId)
    const assetIdsValue = block.data.asset_ids
    if (Array.isArray(assetIdsValue)) {
      for (const value of assetIdsValue) {
        if (typeof value === 'string' && value.trim()) assetIds.add(value)
      }
    }
  }
  if (!assetIds.size) return blocks
  const rows = await queryAll<{ id: string; public_url: string | null; thumbnail_url: string | null; alt_text: string | null }>(db, `
    SELECT id, public_url, thumbnail_url, alt_text
      FROM media_assets
     WHERE site_id = ? AND status = 'active' AND id IN (${Array.from(assetIds).map(() => '?').join(',')})
  `, [siteId, ...assetIds])
  const media = new Map(rows.map(row => [row.id, row]))
  for (const id of assetIds) {
    const asset = media.get(id)
    if (!asset?.public_url) throw createError({ statusCode: 500, statusMessage: `Tenant page media asset ${id} is unavailable` })
  }
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
    return { ...block, data }
  })
}

function mapPage(page: TenantPageDto, blocks: TenantPageBlock[]): PublicTenantPage {
  return {
    id: page.id,
    path: page.published_path,
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
  return mapPage(page, await hydrateBlocks(db, siteId, page.blocks))
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
