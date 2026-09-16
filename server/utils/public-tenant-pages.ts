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
import { getPublishedPosts } from '~/server/utils/post-management'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { EXPERIENCE_PRESENTATION, resolveProductPresentation } from '~/utils/product-presentation'
import { formatMinorAmount } from '~/shared/prices'
import type { CurrencyCode } from '~/shared/currencies'
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
  /** Non-zero exactly when the product takes bookings — an experience. */
  is_bookable: number
  /**
   * The one location publishing this product, or null when several do. A
   * product offered in two places has no single route, so its card links
   * nowhere rather than to a location the merchant did not name.
   */
  location_slug: string | null
  /** The lowest current offer in the site's currency, in minor units. */
  unit_amount: number | null
  compare_at_unit_amount: number | null
  currency: string | null
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
  locale = 'en',
): Promise<PublicTenantPageReferenceRow[]> {
  if (pageIds.length === 0) return []
  // The referenced root, rendered in the requested locale through its own
  // representation row. A page with no translation keeps its English title and
  // route rather than disappearing from the grid unexplained.
  const rows = await queryAll<Omit<PublicTenantPageReferenceRow, 'media'>>(db, `
    SELECT root.id, COALESCE(rep.title, root.title) AS title, COALESCE(rep.summary, root.summary) AS summary,
           COALESCE(rep.slug, root.slug) AS slug, COALESCE(rep.path, root.path) AS path
      FROM content_documents root
      LEFT JOIN content_documents rep ON rep.root_id = root.id AND rep.row_role = 'representation' AND rep.locale = ?
     WHERE root.site_id = ? AND root.row_role = 'root' AND root.kind = 'page'
       AND root.path IS NOT NULL AND root.title IS NOT NULL
       AND root.id IN (SELECT value FROM json_each(?))
     ORDER BY root.sort_order ASC, root.title ASC
  `, [locale, siteId, d1JsonStringSet(pageIds)])
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
  currency: string,
): Promise<PublicTenantPageProductRow[]> {
  const productIds = selection.productIds ?? []
  if (!selection.collectionId && productIds.length === 0) return []
  // The card's price and its route come from the same read as its name. They
  // were resolved in the homepage component instead, over a separate catalogue
  // payload the route had to request, which is why a product grid on any other
  // page showed cards with no price and a link to /products/<slug> — a route
  // no Saya site serves.
  const now = new Date().toISOString()
  const rows = await queryAll<Omit<PublicTenantPageProductRow, 'media'>>(db, `
    SELECT p.id, p.name, p.slug, p.description,
           EXISTS (SELECT 1 FROM product_booking_configs bc WHERE bc.product_id = p.id AND bc.organization_id = p.organization_id) AS is_bookable,
           (SELECT CASE WHEN count(*) = 1 THEN min(bl.slug) END FROM product_locations pl
              JOIN business_locations bl ON bl.id = pl.location_id AND bl.site_id = ? AND bl.status = 'active'
             WHERE pl.product_id = p.id AND pl.organization_id = p.organization_id AND pl.published = 1) AS location_slug,
           offer.unit_amount, offer.compare_at_unit_amount, offer.currency
      FROM products p
      JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
      LEFT JOIN collection_products cp ON cp.product_id = p.id AND cp.collection_id = ?
      LEFT JOIN (
        SELECT pv.product_id, pr.unit_amount, pr.compare_at_unit_amount, pr.currency,
               row_number() OVER (PARTITION BY pv.product_id ORDER BY pr.unit_amount ASC) AS rank
          FROM prices pr
          JOIN product_variants pv ON pv.id = pr.product_variant_id AND pv.organization_id = pr.organization_id AND pv.active = 1
         WHERE pr.active = 1 AND pr.type = 'one_time' AND pr.currency = ?
           AND (pr.valid_from_at IS NULL OR pr.valid_from_at <= ?)
           AND (pr.valid_until_at IS NULL OR pr.valid_until_at > ?)
      ) offer ON offer.product_id = p.id AND offer.rank = 1
     WHERE pub.site_id = ? AND pub.published = 1 AND p.active = 1
       AND (cp.product_id IS NOT NULL OR p.id IN (SELECT value FROM json_each(?)))
     ORDER BY cp.sort_order ASC, p.name ASC
  `, [siteId, selection.collectionId ?? null, currency, now, now, siteId, d1JsonStringSet(productIds)])
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
  // The site's social posts — Google Business updates and anything published
  // beside them. They are `social_post` documents, a different record from the
  // articles `site_posts` reads, and a Saya home shows both.
  const hasUpdateSource = blocks.some(block => block.type === 'feature_grid' && block.data.source === 'site_updates')
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
  // The site this page belongs to. Its template decides where an article
  // lives, its vertical decides where a product lives, and its currency
  // decides which offers apply.
  const siteRow = await queryFirst<{ theme_id: string | null; vertical: string | null; default_currency: string | null }>(
    db, 'SELECT theme_id, vertical, default_currency FROM sites WHERE id = ? LIMIT 1', [siteId])
  if (!siteRow) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page site is unavailable' })
  const template = resolvePublicTemplate({ themeId: siteRow.theme_id, vertical: siteRow.vertical })
  const articlePrefix = template.serviceRoutes.articleDetailPrefix
  const sourcePages = pageIds.size
    ? resources.pages
      ? (await resources.pages).filter(page => pageIds.has(page.id))
      : await listPublicTenantPageReferenceRows(db, siteId, [...pageIds], locale)
    : []
  // Each grid gets the products it named, and only those. Keyed by collection
  // rather than flattened into one list: two grids on a page name two different
  // collections, and a flat union rendered both collections in both grids.
  const currency = siteRow.default_currency
  // Null on a template that sells nothing; its pages carry no product grid.
  const productPresentation = resolveProductPresentation(siteRow.vertical)
  if ((collectionIds.size || productIds.size) && !currency) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page site has no currency' })
  }
  const productsByCollection = new Map(await Promise.all([...collectionIds].map(async collectionId =>
    [collectionId, await listPublicTenantPageProductRows(db, siteId, { collectionId }, currency!)] as const)))
  const productById = new Map((productIds.size
    ? await listPublicTenantPageProductRows(db, siteId, { productIds: [...productIds] }, currency!)
    : []).map(product => [product.id, product]))
  const sourceLocations = locationIds.size
    ? await queryAll<{ id: string; title: string; slug: string; city: string | null; description: string | null; short_description: string | null; asset_id: string | null; public_url: string | null; thumbnail_url: string | null; kind: string | null; alt_text: string | null }>(db, `
        SELECT bl.id, bl.title, bl.slug, bl.city, bl.description, bl.short_description, ma.id AS asset_id, ma.public_url, ma.thumbnail_url, ma.kind, ma.alt_text
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
  const [qaItemsBySource, sourceReviewRows, sourcePostRows, updateRows] = await Promise.all([
    Promise.all([...qaSources].map(async source => [source, faqItems(await listFaqBlockQa(db, siteId, pagePath, source, locale))] as const)).then(entries => new Map(entries)),
    hasReviewSource ? listSiteReviews(db, siteId, { publishedOnly: true }) : Promise.resolve([]),
    hasPostSource ? queryAll<{ id: string; title: string; slug: string; excerpt: string | null; canonical_url: string | null; cover_asset_id: string | null; cover_public_url: string | null; cover_thumbnail_url: string | null; cover_kind: string | null; cover_alt_text: string | null; cover_width: number | null; cover_height: number | null }>(db, `
      SELECT p.id, p.title, p.slug, p.summary AS excerpt, p.canonical_url, ${COVER_SELECT}
        FROM content_documents root JOIN content_documents p ON COALESCE(p.root_id,p.id) = root.id AND p.locale = ?
        ${coverJoinSql('p')}
       WHERE root.kind = 'article' AND root.row_role = 'root' AND p.site_id = ? AND root.status = 'published' AND root.visibility = 'public'
       ORDER BY root.published_at IS NULL, root.published_at DESC, p.id DESC
    `, [locale, siteId]) : Promise.resolve([]),
    hasUpdateSource ? getPublishedPosts(db, siteId, 12, undefined, locale) : Promise.resolve([]),
  ])
  const reviewRows = sourceReviewRows
  const postRows = sourcePostRows
  // A page's translation is its representation row, loaded by locale in the
  // reference query above — not a resource_localizations entry. Only the media
  // alt text needs projecting here.
  const pages = localizations
    ? sourcePages.map(page => ({ ...page, media: projectLocalizedMediaAlt(page.media, localizations) }))
    : sourcePages
  const pageById = new Map(pages.map(item => [item.id, item]))
  const sourceLocationById = new Map(sourceLocations.map(item => [item.id, item]))
  const locationById = new Map(locations.map(item => [item.id, item]))
  const reviewItems = (reviewRows as unknown as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    title: typeof row.author_name === 'string' ? row.author_name : '',
    description: typeof row.content === 'string' ? row.content : undefined,
    value: row.rating == null ? undefined : String(row.rating),
    // The reviewer's picture, which the review record owns. It was dropped on
    // the way into the item, so a template drawing portraits drew none.
    media: Array.isArray(row.media) ? row.media : [],
  }))
  const postItems = postRows.map((post) => {
    const { cover, ...row } = attachCoverMedia(post)
    return {
      id: row.id,
      title: row.title,
      description: row.excerpt || undefined,
      url: row.canonical_url || `${articlePrefix}/${row.slug}`,
      labelKey: 'saya.posts.read_full_story',
      media: cover
        ? projectLocalizedMediaAlt([{ asset_id: cover.asset_id, slot: 'media', public_url: cover.public_url, thumbnail_url: cover.thumbnail_url, kind: cover.kind, alt_text: cover.alt_text }], localizations ?? [])
        : [],
    }
  })
  // A social post is already a published public record with its own route and
  // media; the grid shows it, it does not restate it.
  const updateItems = updateRows.map(post => ({
    id: post.id,
    title: post.title,
    description: post.summary || undefined,
    url: post.public_path,
    labelKey: 'saya.posts.read_full_story',
    media: post.media.map(item => ({
      asset_id: item.asset_id,
      slot: 'media',
      public_url: item.public_url,
      thumbnail_url: item.thumbnail_url ?? null,
      kind: item.kind ?? null,
      alt_text: item.alt_text ?? null,
    })),
  }))
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
      // Either the block names products, or it names a collection. A block that
      // names neither lists nothing — the same rule a page_grid follows.
      const collectionId = typeof data.collection_id === 'string' && data.collection_id.trim() ? data.collection_id : null
      const selected = Array.isArray(data.product_ids) && data.product_ids.length > 0
        ? data.product_ids.map((id) => {
            const product = typeof id === 'string' ? productById.get(id) : undefined
            if (!product) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page product reference is unavailable' })
            return product
          })
        : collectionId
          ? productsByCollection.get(collectionId)
          : []
      if (!selected) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page collection reference is unavailable' })
      data.items = selected.map(product => ({
        id: product.id,
        title: product.name,
        description: product.description || undefined,
        // The product's own surface. An experience is named by its own slug
        // site-wide; every other product is read under the one location that
        // publishes it, and a product published in several places has no
        // single route, so its card carries none.
        url: product.is_bookable
          ? EXPERIENCE_PRESENTATION.productPath('', product.slug)
          : product.location_slug && productPresentation
            ? productPresentation.productPath(product.location_slug, product.slug)
            : '',
        value: product.unit_amount === null || !product.currency
          ? undefined
          : formatMinorAmount(product.unit_amount, product.currency as CurrencyCode),
        compare_at: product.compare_at_unit_amount === null || !product.currency
          ? undefined
          : formatMinorAmount(product.compare_at_unit_amount, product.currency as CurrencyCode),
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
          // The town the visitor is being sent to. A location card names it
          // above the title, and the item carried everything except that.
          city: location.city || undefined,
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
    if (block.type === 'feature_grid' && (data.source === 'site_posts' || data.source === 'site_updates')) {
      const items = data.source === 'site_posts' ? postItems : updateItems
      const limit = typeof data.limit === 'number' && Number.isInteger(data.limit) && data.limit > 0 ? data.limit : items.length
      data.items = items.slice(0, limit)
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
  env: CloudflareEnv,
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
    : options.localizations ?? await loadExactPublicLocalizations(env, db, page.organization_id, siteId, page.locale)
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
  const localeRepresentations = await listPublicLocaleRepresentations(env, db, {
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

export async function listCanonicalTenantPages(env: CloudflareEnv, db: DbClient, siteId: string, locale?: string | null) {
  const paths = await listPublishedTenantPagePaths(db, siteId, locale)
  const pages: PublicTenantPage[] = []
  for (const item of paths) {
    const page = await getPublicTenantPageForPath(env, db, siteId, item.path, { locale })
    if (page) pages.push(page)
  }
  return pages
}
