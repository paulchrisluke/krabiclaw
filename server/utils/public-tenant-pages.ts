import { HTTPError } from 'nitro';
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { listPageQa, type LocationQaRow } from '~/server/utils/location-qa'
import { listSiteReviews } from '~/server/utils/site-reviews'
import { getTenantPageForEditor, getPublishedTenantPage, listPublishedTenantPagePaths, type TenantPageDto } from '~/server/utils/tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import type { MediaPlacementItem } from '~/server/utils/media-placement'
import { loadPublicSocialMedia } from '~/server/utils/public-social-image'
import type { SocialImageSource } from '~/utils/social-metadata'
import {
  loadExactPublicLocalizations,
  projectExactLocalizedCollection,
  projectLocalizedMediaAlt,
  type ExactPublicLocalization,
} from '~/server/utils/public-localization'

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
  media: MediaPlacementItem[]
  social_image: SocialImageSource | null
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
  const placements = await loadPublicSocialMedia(db, siteId, 'offering', rows.map(row => row.id))
  return rows.map(row => ({ ...row, media: placements.get(row.id)?.media ?? [] }))
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
  localizations: readonly ExactPublicLocalization[] | null = null,
): Promise<TenantPageBlock[]> {
  const publicBlocks = selectPublicTenantPageBlocks(blocks)
  const offeringIds = new Set<string>()
  const locationIds = new Set<string>()
  const hasOfferingSource = publicBlocks.some(block => block.type === 'offering_grid' && block.data.source === 'site_offerings')
  const hasQaSource = publicBlocks.some(block => block.type === 'faq' && block.data.source === 'page_qa')
  const hasReviewSource = publicBlocks.some(block => block.type === 'testimonial_grid' && block.data.source === 'site_reviews')
  if (localizations && hasReviewSource) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Reviews do not have localized representations' })
  }
  const hasPostSource = publicBlocks.some(block => block.type === 'feature_grid' && block.data.source === 'site_posts')
  for (const block of publicBlocks) {
    if (block.type === 'offering_grid' && Array.isArray(block.data.offering_ids)) {
      for (const value of block.data.offering_ids) if (typeof value === 'string' && value.trim()) offeringIds.add(value)
    }
    if (block.type === 'location_grid' && Array.isArray(block.data.location_ids)) {
      for (const value of block.data.location_ids) if (typeof value === 'string' && value.trim()) locationIds.add(value)
    }
  }
  const sourceOfferings = offeringIds.size || hasOfferingSource
    ? resources.offerings
      ? (await resources.offerings).filter(offering => hasOfferingSource || offeringIds.has(offering.id))
      : await listPublicTenantPageOfferingRows(db, siteId, hasOfferingSource ? undefined : [...offeringIds])
    : []
  const offerings = localizations
    ? projectExactLocalizedCollection('offering', sourceOfferings, localizations).map((offering) => {
        const representation = localizations.find(item => item.resourceType === 'offering' && item.resourceId === offering.id)
        if (!representation?.routePath) throw new HTTPError({ statusCode: 404, statusMessage: 'Exact localized offering route was not found' })
        return {
          ...offering,
          canonical_path: representation.routePath,
          media: projectLocalizedMediaAlt(offering.media, localizations),
        }
      })
    : sourceOfferings
  const sourceLocations = locationIds.size
    ? await queryAll<{ id: string; title: string; slug: string; description: string | null; short_description: string | null; asset_id: string | null; public_url: string | null; thumbnail_url: string | null; kind: string | null; alt_text: string | null }>(db, `
        SELECT bl.id, bl.title, bl.slug, bl.description, bl.short_description, ma.id AS asset_id, ma.public_url, ma.thumbnail_url, ma.kind, ma.alt_text
          FROM business_locations bl
          LEFT JOIN media_placements mp ON mp.owner_type = 'business_location' AND mp.owner_id = bl.id AND mp.slot = 'hero' AND mp.sort_order = 0 AND mp.status = 'active'
          LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
         WHERE bl.site_id = ? AND bl.status = 'active' AND bl.id IN (SELECT value FROM json_each(?))
      `, [siteId, d1JsonStringSet([...locationIds])])
    : []
  const locations = localizations
    ? projectExactLocalizedCollection('business_location', sourceLocations, localizations).map((location) => {
        const representation = localizations.find(item => item.resourceType === 'business_location' && item.resourceId === location.id)
        const slug = representation?.routePath?.split('/').filter(Boolean).at(-1)
        if (!representation?.routePath || !slug) throw new HTTPError({ statusCode: 404, statusMessage: 'Exact localized location route was not found' })
        return { ...location, slug, public_path: representation.routePath }
      })
    : sourceLocations
  const distinctLocationIds = new Set(locations.map(l => l.id))
  if (distinctLocationIds.size !== locationIds.size) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page references an unavailable location' })
  const [sourceQaRows, sourceReviewRows, sourcePostRows] = await Promise.all([
    hasQaSource ? (resources.qaRows ?? listPageQa(db, siteId, pagePath, true)) : Promise.resolve([]),
    hasReviewSource ? listSiteReviews(db, siteId, { publishedOnly: true }) : Promise.resolve([]),
    hasPostSource ? queryAll<{ id: string; title: string; slug: string; excerpt: string | null; canonical_url: string | null; asset_id: string | null; public_url: string | null; thumbnail_url: string | null; kind: string | null; alt_text: string | null }>(db, `
      SELECT p.id, p.title, p.slug, p.excerpt, p.canonical_url, ma.id AS asset_id, ma.public_url, ma.thumbnail_url, ma.kind, ma.alt_text
        FROM blog_posts p
        LEFT JOIN media_placements mp ON mp.owner_type = 'blog_post' AND mp.owner_id = p.id AND mp.slot = 'featured' AND mp.sort_order = 0 AND mp.status = 'active'
        LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
       WHERE p.site_id = ? AND p.status = 'published' AND p.visibility = 'public'
       ORDER BY COALESCE(p.featured_order, 999999), p.published_at IS NULL, p.published_at DESC, p.id DESC
    `, [siteId]) : Promise.resolve([]),
  ])
  const qaRows = localizations ? projectExactLocalizedCollection('location_qa', sourceQaRows, localizations) : sourceQaRows
  const reviewRows = sourceReviewRows
  const postRows = localizations
    ? projectExactLocalizedCollection('tenant_blog_post', sourcePostRows, localizations).map((post) => {
        const representation = localizations.find(item => item.resourceType === 'tenant_blog_post' && item.resourceId === post.id)
        const slug = representation?.routePath?.split('/').filter(Boolean).at(-1)
        if (!representation?.routePath || !slug) throw new HTTPError({ statusCode: 404, statusMessage: 'Exact localized blog route was not found' })
        return { ...post, slug, canonical_url: representation.routePath }
      })
    : sourcePostRows
  const offeringById = new Map(offerings.map(item => [item.id, item]))
  const selectedOfferings = new Map(Array.from(offeringIds).map(id => [id, offeringById.get(id)] as const))
  if ([...selectedOfferings.values()].some(offering => !offering)) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page references an unavailable offering' })
  const locationById = new Map(locations.map(item => [item.id, item]))
  const qaItems = qaRows.map(row => ({ id: String(row.id), title: String(row.question), description: typeof row.answer === 'string' ? row.answer : undefined }))
  const reviewItems = (reviewRows as unknown as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    title: typeof row.author_name === 'string' ? row.author_name : '',
    description: typeof row.content === 'string' ? row.content : undefined,
    value: row.rating == null ? undefined : String(row.rating),
  }))
  const postItems = postRows.map(post => ({
    id: post.id,
    title: post.title,
    description: post.excerpt || undefined,
    url: post.canonical_url || `/article/${post.slug}`,
    labelKey: 'saya.posts.read_full_story',
    media: post.asset_id
      ? projectLocalizedMediaAlt([{ asset_id: post.asset_id, slot: 'featured', public_url: post.public_url, thumbnail_url: post.thumbnail_url, kind: post.kind, alt_text: post.alt_text }], localizations ?? [])
      : [],
  }))
  const hydratedBlocks = publicBlocks.map(block => {
    const data = { ...block.data }
    if (block.type === 'offering_grid' && Array.isArray(data.offering_ids)) {
      data.items = data.offering_ids.map(id => {
        const offering = typeof id === 'string' ? selectedOfferings.get(id) : undefined
        if (!offering) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page offering reference is unavailable' })
        return {
          id: offering.id,
          title: offering.name,
          description: offering.summary || undefined,
          url: offering.canonical_path || `/services/${offering.slug}`,
          labelKey: 'saya.posts.cta_default',
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
          description: location.short_description || undefined,
          url: 'public_path' in location && typeof location.public_path === 'string' ? location.public_path : `/locations/${location.slug}`,
          labelKey: 'saya.home.visit_location',
          media: location.asset_id
            ? projectLocalizedMediaAlt([{ asset_id: location.asset_id, slot: 'hero', public_url: location.public_url, thumbnail_url: location.thumbnail_url, kind: location.kind, alt_text: location.alt_text }], localizations ?? [])
            : [],
        }
      })
    }
    if (block.type === 'offering_grid' && data.source === 'site_offerings') {
      data.items = offerings.map(offering => {
        return {
          id: offering.id,
          title: offering.name,
          description: offering.summary || undefined,
          url: offering.canonical_path || `/services/${offering.slug}`,
          labelKey: 'saya.posts.cta_default',
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
  if (localizations) assertExactLocalizedBlockContent(hydratedBlocks)
  return hydratedBlocks
}

function assertExactLocalizedBlockContent(blocks: readonly TenantPageBlock[]): void {
  const requiredText = (value: unknown, message: string) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new HTTPError({ statusCode: 404, statusMessage: message })
    }
  }
  for (const block of blocks) {
    if (block.type === 'hero') requiredText(block.data.title, 'Localized hero title was not found')
    if (block.type === 'heading') requiredText(block.data.text, 'Localized heading text was not found')
    if (block.type === 'markdown') {
      const field = Object.hasOwn(block.data, 'markdown') ? block.data.markdown : block.data.content
      requiredText(field, 'Localized markdown content was not found')
    }
    if (!['feature_grid', 'testimonial_grid', 'offering_grid', 'location_grid'].includes(block.type)) continue
    if (!Array.isArray(block.data.items)) continue
    for (const item of block.data.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new HTTPError({ statusCode: 500, statusMessage: 'Stored localized grid item is invalid' })
      }
      const record = item as Record<string, unknown>
      requiredText(
        Object.hasOwn(record, 'title') ? record.title : record.name,
        'Localized grid item title was not found',
      )
      if (typeof record.url === 'string' && record.url.trim()) {
        const label = Object.hasOwn(record, 'label') ? record.label : record.labelKey
        requiredText(label, 'Localized grid item label was not found')
      }
    }
  }
}

function mapPage(page: TenantPageDto, blocks: TenantPageBlock[], socialMedia: { media: MediaPlacementItem[]; social_image: SocialImageSource | null }): PublicTenantPage {
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
    ...socialMedia,
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
    localizations?: readonly ExactPublicLocalization[] | null
  } = {},
): Promise<PublicTenantPage | null> {
  const page = options.preview
    ? await getTenantPageForEditor(db, await resolveVariantId(db, siteId, path, options.locale))
    : await getPublishedTenantPage(db, siteId, path, options.locale)
  if (!page) return null
  const localizations = page.locale === 'en'
    ? null
    : options.localizations ?? await loadExactPublicLocalizations(db, page.organization_id, siteId, page.locale)
  const [blocks, media] = await Promise.all([
    hydrateBlocks(db, siteId, page.path, page.blocks, options.hydrationResources, localizations),
    loadPublicSocialMedia(db, siteId, 'tenant_page', [page.id]),
  ])
  const localizedMedia = page.locale === 'en'
    ? media.get(page.id) ?? { media: [], social_image: null }
    : {
        ...(media.get(page.id) ?? { media: [], social_image: null }),
        media: projectLocalizedMediaAlt(media.get(page.id)?.media ?? [], localizations ?? []),
      }
  if (page.locale !== 'en') {
    for (const block of blocks) {
      block.media = projectLocalizedMediaAlt(
        block.media.map(item => ({ ...item, alt_text: item.alt_text ?? null })),
        localizations ?? [],
      )
    }
  }
  return mapPage(page, blocks, localizedMedia)
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
