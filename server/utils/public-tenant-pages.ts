import { HTTPError } from 'nitro';
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { faqBlockSource, faqItems, listFaqBlockQa } from '~/server/utils/location-qa'
import type { FaqBlockSource } from '~/shared/faq-block'
import { listSiteReviews } from '~/server/utils/site-reviews'
import { getTenantPageForEditor, getPublishedTenantPage, listPublishedTenantPagePaths, type TenantPageDto } from '~/server/utils/content/pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import type { MediaPlacementItem } from '~/server/utils/media-placement'
import { COVER_SELECT, attachCoverMedia, coverJoinSql } from '~/server/utils/content/cover'
import { loadPublicSocialMedia } from '~/server/utils/public-social-image'
import type { SocialImageSource } from '~/utils/social-metadata'
import {
  loadExactPublicLocalizations,
  projectExactLocalizedCollection,
  projectLocalizedMediaAlt,
  type ExactPublicLocalization,
} from '~/server/utils/public-localization'
import { listPublicLocaleRepresentations, resolvePublicDocumentSourcePath } from '~/server/utils/public-locale-representations'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

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
  sort_order: number
  locale: string
  blocks: TenantPageBlock[]
  media: MediaPlacementItem[]
  social_image: SocialImageSource | null
  localeRepresentations?: PublicLocaleRepresentation[]
  updated_at: string
}

/** A page referenced by a page_grid block. */
export interface PublicTenantPageReferenceRow {
  id: string
  title: string
  summary: string | null
  slug: string
  path: string
  media: MediaPlacementItem[]
}

/** A product referenced by a product_grid block. */
export interface PublicTenantPageProductRow {
  id: string
  name: string
  slug: string
  description: string
  media: MediaPlacementItem[]
}

export interface PublicTenantPageHydrationResources {
  pages?: Promise<PublicTenantPageReferenceRow[]>
}

/**
 * Resolve the pages a page_grid names.
 *
 * Only published roots, and only the ones named. A grid cannot list "every
 * page on the site" — that source is gone, because it silently changed
 * whenever anyone added a page.
 */
export async function listPublicTenantPageReferenceRows(
  db: DbClient,
  siteId: string,
  pageIds: readonly string[],
): Promise<PublicTenantPageReferenceRow[]> {
  if (pageIds.length === 0) return []
  const rows = await queryAll<Omit<PublicTenantPageReferenceRow, 'media'>>(db, `
    SELECT d.id, d.title, d.summary, d.slug, d.path
      FROM content_documents d
     WHERE d.site_id = ? AND d.row_role = 'root' AND d.kind = 'page'
       AND d.path IS NOT NULL AND d.title IS NOT NULL
       AND d.id IN (SELECT value FROM json_each(?))
     ORDER BY d.sort_order ASC, d.title ASC
  `, [siteId, d1JsonStringSet(pageIds)])
  const placements = await loadPublicSocialMedia(db, siteId, 'content_document', rows.map(row => row.id))
  return rows.map(row => ({ ...row, media: placements.get(row.id)?.media ?? [] }))
}

/**
 * Resolve the products a product_grid names, by collection or by id.
 *
 * The grid stores references only, so names and descriptions come from the
 * product every time it renders and cannot go stale.
 */
export async function listPublicTenantPageProductRows(
  db: DbClient,
  siteId: string,
  selection: { collectionId?: string | null; productIds?: readonly string[] },
): Promise<PublicTenantPageProductRow[]> {
  const productIds = selection.productIds ?? []
  if (!selection.collectionId && productIds.length === 0) return []
  const rows = await queryAll<Omit<PublicTenantPageProductRow, 'media'>>(db, `
    SELECT p.id, p.name, p.slug, p.description
      FROM products p
      JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
      LEFT JOIN collection_products cp ON cp.product_id = p.id AND cp.collection_id = ?
     WHERE pub.site_id = ? AND pub.published = 1 AND p.active = 1
       AND (cp.product_id IS NOT NULL OR p.id IN (SELECT value FROM json_each(?)))
     ORDER BY cp.sort_order ASC, p.name ASC
  `, [selection.collectionId ?? null, siteId, d1JsonStringSet(productIds)])
  const placements = await loadPublicSocialMedia(db, siteId, 'product', rows.map(row => row.id))
  return rows.map(row => ({ ...row, media: placements.get(row.id)?.media ?? [] }))
}

async function hydrateBlocks(
  db: DbClient,
  siteId: string,
  pagePath: string,
  locale: string,
  blocks: TenantPageBlock[],
  resources: PublicTenantPageHydrationResources = {},
  localizations: readonly ExactPublicLocalization[] | null = null,
): Promise<TenantPageBlock[]> {
  const pageIds = new Set<string>()
  const productIds = new Set<string>()
  const collectionIds = new Set<string>()
  const locationIds = new Set<string>()
  const qaSources = new Set(blocks.map(faqBlockSource).filter((source): source is FaqBlockSource => source !== null))
  const hasReviewSource = blocks.some(block => block.type === 'testimonial_grid' && block.data.source === 'site_reviews')
  const hasPostSource = blocks.some(block => block.type === 'feature_grid' && block.data.source === 'site_posts')
  for (const block of blocks) {
    if (block.type === 'page_grid' && Array.isArray(block.data.page_ids)) {
      for (const value of block.data.page_ids) if (typeof value === 'string' && value.trim()) pageIds.add(value)
    }
    if (block.type === 'product_grid') {
      if (Array.isArray(block.data.product_ids)) {
        for (const value of block.data.product_ids) if (typeof value === 'string' && value.trim()) productIds.add(value)
      }
      if (typeof block.data.collection_id === 'string' && block.data.collection_id.trim()) collectionIds.add(block.data.collection_id)
    }
    if (block.type === 'location_grid' && Array.isArray(block.data.location_ids)) {
      for (const value of block.data.location_ids) if (typeof value === 'string' && value.trim()) locationIds.add(value)
    }
  }
  const sourcePages = pageIds.size
    ? resources.pages
      ? (await resources.pages).filter(page => pageIds.has(page.id))
      : await listPublicTenantPageReferenceRows(db, siteId, [...pageIds])
    : []
  const products = (await Promise.all([...collectionIds].map(collectionId =>
    listPublicTenantPageProductRows(db, siteId, { collectionId })))).flat()
    .concat(productIds.size ? await listPublicTenantPageProductRows(db, siteId, { productIds: [...productIds] }) : [])
  const productById = new Map(products.map(product => [product.id, product]))
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
        if (!representation?.routePath?.startsWith('/') || !slug) {
          throw new HTTPError({ statusCode: 500, statusMessage: 'Stored localized location route is invalid', data: { code: 'INVALID_STORED_CONTENT' } })
        }
        return { ...location, slug, public_path: representation.routePath }
      })
    : sourceLocations
  const [qaItemsBySource, sourceReviewRows, sourcePostRows] = await Promise.all([
    Promise.all([...qaSources].map(async source => [source, faqItems(await listFaqBlockQa(db, siteId, pagePath, source, locale))] as const)).then(entries => new Map(entries)),
    hasReviewSource ? listSiteReviews(db, siteId, { publishedOnly: true }) : Promise.resolve([]),
    hasPostSource ? queryAll<{ id: string; title: string; slug: string; excerpt: string | null; canonical_url: string | null; cover_asset_id: string | null; cover_public_url: string | null; cover_thumbnail_url: string | null; cover_kind: string | null; cover_alt_text: string | null; cover_width: number | null; cover_height: number | null }>(db, `
      SELECT p.id, p.title, p.slug, p.summary AS excerpt, p.canonical_url, ${COVER_SELECT}
        FROM content_documents root JOIN content_documents p ON COALESCE(p.root_id,p.id) = root.id AND p.locale = ?
        ${coverJoinSql('p')}
       WHERE root.kind = 'article' AND root.row_role = 'root' AND p.site_id = ? AND root.status = 'published' AND root.visibility = 'public'
       ORDER BY root.published_at IS NULL, root.published_at DESC, p.id DESC
    `, [locale, siteId]) : Promise.resolve([]),
  ])
  const reviewRows = sourceReviewRows
  const postRows = sourcePostRows
  // Localized pages carry their own route and title; the source row is kept
  // so a reference to a page that is not translated still resolves to the
  // English page rather than vanishing from the grid without explanation.
  const pages = localizations
    ? sourcePages.map((page) => {
        const representation = localizations.find(item => item.resourceType === 'content_document' && item.resourceId === page.id)
        return representation?.routePath?.startsWith('/')
          ? { ...page, path: representation.routePath, media: projectLocalizedMediaAlt(page.media, localizations) }
          : page
      })
    : sourcePages
  const pageById = new Map(pages.map(item => [item.id, item]))
  const sourceLocationById = new Map(sourceLocations.map(item => [item.id, item]))
  const locationById = new Map(locations.map(item => [item.id, item]))
  const reviewItems = (reviewRows as unknown as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    title: typeof row.author_name === 'string' ? row.author_name : '',
    description: typeof row.content === 'string' ? row.content : undefined,
    value: row.rating == null ? undefined : String(row.rating),
  }))
  const postItems = postRows.map((post) => {
    const { cover, ...row } = attachCoverMedia(post)
    return {
      id: row.id,
      title: row.title,
      description: row.excerpt || undefined,
      url: row.canonical_url || `/article/${row.slug}`,
      labelKey: 'saya.posts.read_full_story',
      media: cover
        ? projectLocalizedMediaAlt([{ asset_id: cover.asset_id, slot: 'media', public_url: cover.public_url, thumbnail_url: cover.thumbnail_url, kind: cover.kind, alt_text: cover.alt_text }], localizations ?? [])
        : [],
    }
  })
  return blocks.map(block => {
    const data = { ...block.data }
    if (block.type === 'page_grid' && Array.isArray(data.page_ids)) {
      data.items = data.page_ids.map((id) => {
        const page = typeof id === 'string' ? pageById.get(id) : undefined
        // A reference to a page that is gone or unpublished is a broken block,
        // not a row to quietly drop: the editor chose it and needs to know.
        if (!page) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page reference is unavailable' })
        return {
          id: page.id,
          title: page.title,
          description: page.summary ?? undefined,
          url: page.path,
          labelKey: 'saya.posts.cta_default',
          media: page.media,
        }
      })
    }
    if (block.type === 'product_grid') {
      const selected = Array.isArray(data.product_ids) && data.product_ids.length > 0
        ? data.product_ids.map((id) => {
            const product = typeof id === 'string' ? productById.get(id) : undefined
            if (!product) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page product reference is unavailable' })
            return product
          })
        : products
      data.items = selected.map(product => ({
        id: product.id,
        title: product.name,
        description: product.description || undefined,
        url: `/products/${product.slug}`,
        labelKey: 'saya.posts.cta_default',
        media: product.media,
      }))
    }
    if (block.type === 'location_grid' && Array.isArray(data.location_ids)) {
      data.items = data.location_ids.flatMap((id) => {
        const sourceLocation = typeof id === 'string' ? sourceLocationById.get(id) : undefined
        if (!sourceLocation) {
          throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page location reference is unavailable' })
        }
        const location = locationById.get(sourceLocation.id)
        if (!location) return []
        return [{
          id: location.id,
          title: location.title,
          description: location.short_description || location.description || undefined,
          url: 'public_path' in location && typeof location.public_path === 'string' ? location.public_path : `/locations/${location.slug}`,
          labelKey: 'saya.home.visit_location',
          media: location.asset_id
            ? projectLocalizedMediaAlt([{ asset_id: location.asset_id, slot: 'hero', public_url: location.public_url, thumbnail_url: location.thumbnail_url, kind: location.kind, alt_text: location.alt_text }], localizations ?? [])
            : [],
        }]
      })
    }
    const faqSource = faqBlockSource(block)
    if (faqSource) data.items = qaItemsBySource.get(faqSource)
    if (block.type === 'testimonial_grid' && data.source === 'site_reviews') data.items = reviewItems
    if (block.type === 'feature_grid' && data.source === 'site_posts') {
      const limit = typeof data.limit === 'number' && Number.isInteger(data.limit) && data.limit > 0 ? data.limit : postItems.length
      data.items = postItems.slice(0, limit)
    }
    return { ...block, data }
  })
}

function mapPage(
  page: TenantPageDto,
  blocks: TenantPageBlock[],
  socialMedia: { media: MediaPlacementItem[]; social_image: SocialImageSource | null },
  localeRepresentations: PublicLocaleRepresentation[],
): PublicTenantPage {
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
    sort_order: page.sort_order,
    locale: page.locale,
    blocks,
    ...socialMedia,
    localeRepresentations,
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
  const [blocks, media, sourceLocale] = await Promise.all([
    hydrateBlocks(db, siteId, page.path, page.locale, page.blocks, options.hydrationResources, localizations),
    loadPublicSocialMedia(db, siteId, 'content_document', [page.id]),
    queryFirst<{ locale: string }>(db, `
      SELECT locale FROM site_locales
       WHERE organization_id = ? AND site_id = ? AND is_source = 1
       LIMIT 1
    `, [page.organization_id, siteId]),
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
  if (!sourceLocale) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Site primary language is missing' })
  }
  const localeRepresentations = await listPublicLocaleRepresentations(db, {
    organizationId: page.organization_id,
    siteId,
    sourcePath: await resolvePublicDocumentSourcePath(db, siteId, page.page_id),
    documentId: page.page_id,
  })
  const publicPage = page.locale === sourceLocale.locale
    ? page
    : { ...page, seo_title: page.title, seo_description: page.summary }
  return mapPage(publicPage, blocks, localizedMedia, localeRepresentations)
}

async function resolveVariantId(db: DbClient, siteId: string, path: string, locale?: string | null): Promise<string> {
  const row = await queryFirst<{ id: string } | null>(db, `
    SELECT v.id
      FROM content_documents v
     WHERE v.kind = 'page' AND v.row_role IN ('root','representation') AND v.site_id = ? AND v.path = ?
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
