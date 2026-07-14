import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { listPageQa } from '~/server/utils/location-qa'
import { listSiteReviews } from '~/server/utils/site-reviews'
import { getPublishedSiteBlogPost } from '~/server/utils/platform-content'
import type { SiteConversionEventName } from '~/utils/site-conversion-events'
import type {
  PublicBlawbyData,
  PublicBlawbyIdentity,
  PublicBlawbyRouteData,
  PublicBlawbyShellData,
  PublicBlogSummary,
  PublicBlogPost,
  PublicCompliance,
  PublicComplianceContactPoint,
  PublicConsultationSettings,
  PublicNavigationItem,
  PublicOffering,
  PublicOfferingFeature,
  PublicOfferingLink,
  PublicOfferingSummary,
  PublicSiteQa,
  PublicSiteReview,
  PublicTenantPage,
} from '~/types/blawby'

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function asBoolean(value: unknown) {
  return value === true || value === 1 || value === '1'
}

type OfferingRow = ApiRecord & {
  features: string | null
  faqs: string | null
  media_asset_ids: string | null
  thumbnail_url: string | null
  hero_image_url: string | null
  location_address: string | null
  location_city: string | null
}

type TenantPageRow = ApiRecord & {
  components_json: string | null
}

async function loadMediaById(db: DbClient, siteId: string, mediaIds: string[]) {
  const uniqueIds = Array.from(new Set(mediaIds)).filter(Boolean)
  const mediaRows = uniqueIds.length
    ? await queryAll<ApiRecord>(db, `
        SELECT id, public_url, kind, alt_text, width, height
          FROM media_assets
         WHERE site_id = ? AND id IN (${uniqueIds.map(() => '?').join(',')}) AND status = 'active'
      `, [siteId, ...uniqueIds])
    : []
  return new Map(mediaRows.map(row => [String(row.id), row]))
}

function mapOfferingRow(row: OfferingRow, mediaById: Map<string, ApiRecord>): PublicOffering {
  const ids = parseJson<string[]>(row.media_asset_ids, [])
  const rawFeatures = parseJson<unknown[]>(row.features, [])
  const features: PublicOfferingFeature[] = rawFeatures.map((feature, index) => {
    if (typeof feature === 'string') {
      const separator = feature.indexOf(':')
      return {
        title: separator > 0 ? feature.slice(0, separator).trim() : feature,
        description: separator > 0 ? feature.slice(separator + 1).trim() : '',
        image_url: null,
        icon: null,
        icon_url: null,
        sort_order: index,
      }
    }
    const record = feature && typeof feature === 'object' ? feature as ApiRecord : {}
    return {
      title: String(record.title || record.name || `Feature ${index + 1}`),
      description: String(record.description || record.desc || ''),
      image_url: typeof record.image_url === 'string' ? record.image_url : null,
      icon: typeof record.icon === 'string' ? record.icon : null,
      icon_url: typeof record.icon_url === 'string' ? record.icon_url : null,
      sort_order: Number(record.sort_order ?? index),
    }
  }).sort((left, right) => left.sort_order - right.sort_order)
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    label: typeof row.label === 'string' ? row.label : null,
    summary: typeof row.summary === 'string' ? row.summary : null,
    short_description: typeof row.short_description === 'string' ? row.short_description : null,
    body: typeof row.body === 'string' ? row.body : null,
    features,
    faqs: parseJson<Array<{ question: string; answer: string }>>(row.faqs, []),
    cta_label: typeof row.cta_label === 'string' ? row.cta_label : null,
    cta_url: typeof row.cta_url === 'string' ? row.cta_url : null,
    thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
    hero_image_url: typeof row.hero_image_url === 'string' ? row.hero_image_url : null,
    media: ids.map(id => mediaById.get(id)).filter(Boolean).map(asset => ({
      id: String(asset!.id),
      url: String(asset!.public_url),
      kind: String(asset!.kind || 'image'),
      alt_text: typeof asset!.alt_text === 'string' ? String(asset!.alt_text) : null,
      width: Number.isFinite(Number(asset!.width)) ? Number(asset!.width) : null,
      height: Number.isFinite(Number(asset!.height)) ? Number(asset!.height) : null,
    })),
    schema_type: typeof row.schema_type === 'string' ? row.schema_type : null,
    seo_title: typeof row.seo_title === 'string' ? row.seo_title : null,
    seo_description: typeof row.seo_description === 'string' ? row.seo_description : null,
    canonical_path: typeof row.canonical_path === 'string' ? row.canonical_path : null,
    status: String(row.status),
    sort_order: Number(row.sort_order ?? 0),
    featured: asBoolean(row.featured),
    // Real business_locations data for the offering's own location, when one
    // is associated (offerings.location_id) — used to populate a
    // schema.org PostalAddress on the offering's own graph node rather than
    // always falling back to the site's primary location. Null when the
    // offering is site-wide (no location_id) or the location has no address.
    location_address_street: typeof row.location_address === 'string' ? row.location_address : null,
    location_address_locality: typeof row.location_city === 'string' ? row.location_city : null,
  }
}

function mapTenantPageRow(row: TenantPageRow): PublicTenantPage {
  return {
    id: String(row.id),
    path: String(row.path),
    title: String(row.title),
    page_type: String(row.page_type),
    summary: typeof row.summary === 'string' ? row.summary : null,
    body: typeof row.body === 'string' ? row.body : null,
    components: parseJson<ApiRecord[]>(row.components_json, []),
    cta_label: typeof row.cta_label === 'string' ? row.cta_label : null,
    cta_url: typeof row.cta_url === 'string' ? row.cta_url : null,
    seo_title: typeof row.seo_title === 'string' ? row.seo_title : null,
    seo_description: typeof row.seo_description === 'string' ? row.seo_description : null,
    canonical_url: typeof row.canonical_url === 'string' ? row.canonical_url : null,
    robots: typeof row.robots === 'string' ? row.robots : null,
    sort_order: Number(row.sort_order ?? 0),
  }
}

export async function listPublicOfferings(db: DbClient, siteId: string): Promise<PublicOffering[]> {
  const rows = await queryAll<OfferingRow>(db, `
    SELECT o.*,
           thumb.public_url AS thumbnail_url,
           hero.public_url AS hero_image_url,
           loc.address AS location_address,
           loc.city AS location_city
      FROM offerings o
      LEFT JOIN media_assets thumb ON o.thumbnail_asset_id = thumb.id AND thumb.status = 'active'
      LEFT JOIN media_assets hero ON o.hero_image_asset_id = hero.id AND hero.status = 'active'
      LEFT JOIN business_locations loc ON o.location_id = loc.id AND loc.status = 'active'
     WHERE o.site_id = ? AND o.status = 'published'
     ORDER BY o.sort_order ASC, o.name ASC
  `, [siteId])

  const mediaIds = rows.flatMap(row => parseJson<string[]>(row.media_asset_ids, []))
  const mediaById = await loadMediaById(db, siteId, mediaIds)
  return rows.map(row => mapOfferingRow(row, mediaById))
}

export async function listPublicOfferingLinks(db: DbClient, siteId: string): Promise<PublicOfferingLink[]> {
  const rows = await queryAll<ApiRecord>(db, `
    SELECT id, name, slug, canonical_path
      FROM offerings
     WHERE site_id = ? AND status = 'published'
     ORDER BY sort_order ASC, name ASC
  `, [siteId])

  return rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    canonical_path: typeof row.canonical_path === 'string' && row.canonical_path
      ? row.canonical_path
      : `/services/${String(row.slug)}`,
  }))
}

export async function listPublicOfferingSummaries(db: DbClient, siteId: string): Promise<PublicOfferingSummary[]> {
  const rows = await queryAll<ApiRecord>(db, `
    SELECT o.id, o.name, o.slug, o.label, o.summary, o.short_description,
           thumb.public_url AS thumbnail_url, o.canonical_path, o.sort_order, o.featured
      FROM offerings o
      LEFT JOIN media_assets thumb ON o.thumbnail_asset_id = thumb.id AND thumb.status = 'active'
     WHERE o.site_id = ? AND o.status = 'published'
     ORDER BY o.sort_order ASC, o.name ASC
  `, [siteId])
  return rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    label: typeof row.label === 'string' ? row.label : null,
    summary: typeof row.summary === 'string' ? row.summary : null,
    short_description: typeof row.short_description === 'string' ? row.short_description : null,
    thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
    canonical_path: typeof row.canonical_path === 'string' && row.canonical_path
      ? row.canonical_path
      : `/services/${String(row.slug)}`,
    sort_order: Number(row.sort_order ?? 0),
    featured: asBoolean(row.featured),
  }))
}

export async function listPublicBlogSummaries(db: DbClient, siteId: string, limit = 50): Promise<PublicBlogSummary[]> {
  const rows = await queryAll<ApiRecord>(db, `
    SELECT p.id, p.title, p.slug, p.excerpt, p.category, p.tags_json, p.published_at, p.canonical_url, p.featured_order,
           u.name AS author_name, u.image AS author_image, media.public_url, media.width, media.height
      FROM blog_posts p
      LEFT JOIN user u ON u.id = p.author_id
      LEFT JOIN media_assets media ON media.id = p.featured_image_asset_id AND media.status = 'active'
     WHERE p.site_id = ? AND p.status = 'published'
     ORDER BY COALESCE(p.featured_order, 999999), p.published_at IS NULL, p.published_at DESC, p.id DESC
     LIMIT ?
  `, [siteId, Math.max(1, Math.min(50, Math.trunc(limit)))])
  return rows.map(row => ({
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    excerpt: typeof row.excerpt === 'string' ? row.excerpt : null,
    category: typeof row.category === 'string' ? row.category : null,
    tags: parseJson<string[]>(row.tags_json, []),
    featured_order: Number.isFinite(Number(row.featured_order)) ? Number(row.featured_order) : null,
    author_name: typeof row.author_name === 'string' ? row.author_name : null,
    author_image: typeof row.author_image === 'string' ? row.author_image : null,
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
    canonical_url: typeof row.canonical_url === 'string' && row.canonical_url
      ? row.canonical_url
      : `/article/${String(row.slug)}`,
    featured_image: typeof row.public_url === 'string' && row.public_url
      ? {
          public_url: row.public_url,
          width: Number.isFinite(Number(row.width)) ? Number(row.width) : null,
          height: Number.isFinite(Number(row.height)) ? Number(row.height) : null,
        }
      : null,
  }))
}

export async function getPublicOfferingBySlug(db: DbClient, siteId: string, slug: string): Promise<PublicOffering | null> {
  const row = await queryFirst<OfferingRow>(db, `
    SELECT o.*,
           thumb.public_url AS thumbnail_url,
           hero.public_url AS hero_image_url,
           loc.address AS location_address,
           loc.city AS location_city
      FROM offerings o
      LEFT JOIN media_assets thumb ON o.thumbnail_asset_id = thumb.id AND thumb.status = 'active'
      LEFT JOIN media_assets hero ON o.hero_image_asset_id = hero.id AND hero.status = 'active'
      LEFT JOIN business_locations loc ON o.location_id = loc.id AND loc.status = 'active'
     WHERE o.site_id = ? AND o.slug = ? AND o.status = 'published'
     LIMIT 1
  `, [siteId, slug])
  if (!row) return null
  const mediaById = await loadMediaById(db, siteId, parseJson<string[]>(row.media_asset_ids, []))
  return mapOfferingRow(row, mediaById)
}

export async function listPublicTenantPages(db: DbClient, siteId: string): Promise<PublicTenantPage[]> {
  const rows = await queryAll<TenantPageRow>(db, `
    SELECT *
      FROM tenant_pages
     WHERE site_id = ? AND status = 'published'
     ORDER BY sort_order ASC, title ASC
  `, [siteId])

  return rows.map(mapTenantPageRow)
}

export async function getPublicTenantPageByPath(db: DbClient, siteId: string, path: string): Promise<PublicTenantPage | null> {
  const row = await queryFirst<TenantPageRow>(db, `
    SELECT *
      FROM tenant_pages
     WHERE site_id = ? AND path = ? AND status = 'published'
     LIMIT 1
  `, [siteId, path])
  return row ? mapTenantPageRow(row) : null
}

export async function getPublicConsultationSettings(db: DbClient, siteId: string): Promise<PublicConsultationSettings> {
  const row = await queryFirst<ApiRecord>(db, `
    SELECT mode, cta_label, external_url, schedule_path, confirmation_path, tracking_enabled, metadata_json
      FROM site_consultation_settings
     WHERE site_id = ?
     LIMIT 1
  `, [siteId])

  const metadata = parseJson<ApiRecord>(row?.metadata_json as string | null, {})

  return {
    mode: row?.mode === 'native_disabled' ? 'native_disabled' : 'external_url',
    cta_label: typeof row?.cta_label === 'string' && row.cta_label.trim() ? row.cta_label : 'Book a consultation',
    external_url: typeof row?.external_url === 'string' ? row.external_url : null,
    schedule_path: typeof row?.schedule_path === 'string' ? row.schedule_path : '/schedule',
    confirmation_path: typeof row?.confirmation_path === 'string' ? row.confirmation_path : '/contact/confirmed',
    tracking_enabled: row?.tracking_enabled == null ? true : asBoolean(row.tracking_enabled),
    contact_form_enabled: metadata.contact_form_enabled == null ? true : asBoolean(metadata.contact_form_enabled),
    metadata,
  }
}

export async function getPublicCompliance(db: DbClient, siteId: string): Promise<PublicCompliance | null> {
  const row = await queryFirst<ApiRecord>(db, `
    SELECT *
      FROM tenant_compliance
     WHERE site_id = ?
     LIMIT 1
  `, [siteId])
  if (!row) return null
  const visibleAddress = row.address_visibility === 'visible'
    ? await queryFirst<ApiRecord>(db, `
        SELECT address, city
          FROM business_locations
         WHERE site_id = ? AND status = 'active'
           AND address IS NOT NULL AND trim(address) <> ''
         ORDER BY is_primary DESC, title ASC, id ASC
         LIMIT 1
      `, [siteId])
    : null
  const documentAssetIds = parseJson<string[]>(row.document_asset_ids as string | null, [])
  const documentRows = documentAssetIds.length
    ? await queryAll<ApiRecord>(db, `
        SELECT id, public_url, alt_text, file_name
          FROM media_assets
         WHERE site_id = ? AND id IN (${documentAssetIds.map(() => '?').join(',')}) AND status = 'active'
         ORDER BY file_name ASC, id ASC
      `, [siteId, ...documentAssetIds])
    : []
  return {
    entity_name: typeof row.entity_name === 'string' ? row.entity_name : null,
    dba_name: typeof row.dba_name === 'string' ? row.dba_name : null,
    entity_type: typeof row.entity_type === 'string' ? row.entity_type : null,
    nonprofit_status: typeof row.nonprofit_status === 'string' ? row.nonprofit_status : null,
    registration_number: typeof row.registration_number === 'string' ? row.registration_number : null,
    service_area: typeof row.service_area === 'string' ? row.service_area : null,
    service_area_type: typeof row.service_area_type === 'string' ? row.service_area_type : null,
    disclaimer: typeof row.disclaimer === 'string' ? row.disclaimer : null,
    footer_disclaimer: typeof row.footer_disclaimer === 'string' ? row.footer_disclaimer : null,
    document_asset_ids: documentAssetIds,
    documents: documentRows.map(document => ({
      id: String(document.id),
      url: typeof document.public_url === 'string' && document.public_url ? document.public_url : null,
      label: typeof document.alt_text === 'string' ? document.alt_text : null,
      file_name: typeof document.file_name === 'string' ? document.file_name : null,
    })),
    founder_name: typeof row.founder_name === 'string' ? row.founder_name : null,
    founding_date: typeof row.founding_date === 'string' ? row.founding_date : null,
    same_as: parseJson<string[]>(row.same_as as string | null, []),
    contact_points: parseJson<PublicComplianceContactPoint[]>(row.contact_points as string | null, []),
    address_visibility: row.address_visibility === 'visible' ? 'visible' : 'hidden',
    address: visibleAddress
      ? {
          street_address: typeof visibleAddress.address === 'string' ? visibleAddress.address : null,
          locality: typeof visibleAddress.city === 'string' ? visibleAddress.city : null,
          region: null,
          postal_code: null,
          country: null,
        }
      : null,
    metadata: parseJson<ApiRecord>(row.metadata_json as string | null, {}),
  }
}

export async function listPublicNavigationItems(db: DbClient, siteId: string): Promise<PublicNavigationItem[]> {
  const rows = await queryAll<ApiRecord>(db, `
    SELECT *
      FROM tenant_navigation_items
     WHERE site_id = ? AND status = 'active'
     ORDER BY area ASC, sort_order ASC, label ASC
  `, [siteId])
  return rows.map(row => ({
    id: String(row.id),
    area: String(row.area || 'header') as PublicNavigationItem['area'],
    label: String(row.label),
    url: String(row.url),
    item_type: String(row.item_type || 'internal'),
    sort_order: Number(row.sort_order ?? 0),
    metadata: parseJson<ApiRecord>(row.metadata_json as string | null, {}),
  }))
}

export async function getPublicThemeTokens(db: DbClient, siteId: string, templateSlug = 'blawby'): Promise<ApiRecord> {
  const row = await queryFirst<{ tokens_json: string | null }>(db, `
    SELECT tokens_json
      FROM site_theme_tokens
     WHERE site_id = ? AND template_slug = ? AND status = 'active'
     LIMIT 1
  `, [siteId, templateSlug])
  return parseJson<ApiRecord>(row?.tokens_json, {})
}

export async function getPublicBlawbyIdentity(db: DbClient, siteId: string): Promise<PublicBlawbyIdentity> {
  const row = await queryFirst<ApiRecord>(db, `
    SELECT s.brand_name, s.brand_description, s.contact_phone, COALESCE(logo.public_url, s.logo_url) AS logo_url,
           primary_loc.address AS primary_location_address,
           primary_loc.city AS primary_location_city
      FROM sites s
      LEFT JOIN media_assets logo ON s.logo_asset_id = logo.id AND logo.status = 'active'
      LEFT JOIN business_locations primary_loc ON s.primary_location_id = primary_loc.id AND primary_loc.status = 'active'
     WHERE s.id = ?
     LIMIT 1
  `, [siteId])

  return {
    brand_name: typeof row?.brand_name === 'string' ? row.brand_name : null,
    brand_description: typeof row?.brand_description === 'string' ? row.brand_description : null,
    logo_url: typeof row?.logo_url === 'string' ? row.logo_url : null,
    phone: typeof row?.contact_phone === 'string' ? row.contact_phone : null,
    banner_content: null,
    banner_dismissible: false,
    // The site's primary business_locations row, if any — the seam for
    // threading a real PostalAddress into the org-level schema.org graph
    // node (see utils/professional-service-schema.ts / useBlawbyOrgIdentity).
    primary_location_address_street: typeof row?.primary_location_address === 'string' ? row.primary_location_address : null,
    primary_location_address_locality: typeof row?.primary_location_city === 'string' ? row.primary_location_city : null,
  }
}

export async function getPublicBlawbyShellData(db: DbClient, siteId: string): Promise<PublicBlawbyShellData> {
  const [identity, navigation, consultation, compliance, themeTokens, offeringLinks] = await Promise.all([
    getPublicBlawbyIdentity(db, siteId),
    listPublicNavigationItems(db, siteId),
    getPublicConsultationSettings(db, siteId),
    getPublicCompliance(db, siteId),
    getPublicThemeTokens(db, siteId),
    listPublicOfferingLinks(db, siteId),
  ])
  const header = compliance?.metadata?.header
  if (header && typeof header === 'object') {
    identity.banner_content = typeof (header as ApiRecord).banner_content === 'string' ? String((header as ApiRecord).banner_content) : null
    identity.banner_dismissible = asBoolean((header as ApiRecord).banner_dismissible)
  }
  return { identity, navigation, consultation, compliance, themeTokens, offeringLinks }
}

const ROUTE_PAGE_PATHS: Record<PublicBlawbyRouteData['recipe'], string | null> = {
  home: '/',
  services: '/services',
  offering: '/services',
  about: '/about',
  pricing: '/pricing',
  contact: '/contact',
  schedule: '/schedule',
  blog: '/blog',
  article: '/blog',
  donate: '/donate',
  privacy: '/policies/privacy',
  terms: '/policies/terms',
  'third-party-notices': '/third-party-notices',
}

function mapPublicQa(rows: Array<Record<string, unknown>>): PublicSiteQa[] {
  return rows.map(row => ({
    id: String(row.id),
    question: String(row.question),
    answer: typeof row.answer === 'string' ? row.answer : null,
    sort_order: Number(row.sort_order ?? 0),
  }))
}

function mapPublicReviews(rows: Array<Record<string, unknown>>): PublicSiteReview[] {
  return rows.map(row => ({
    id: String(row.id),
    author_name: String(row.author_name || 'Client'),
    reviewer_photo_url: typeof row.reviewer_photo_url === 'string' ? row.reviewer_photo_url : null,
    rating: Number(row.rating ?? 5),
    title: typeof row.title === 'string' ? row.title : null,
    content: String(row.content || ''),
    original_review_date: typeof row.original_review_date === 'string' ? row.original_review_date : null,
    verified: row.verified === true,
  }))
}

function mapPublicBlogPost(row: ApiRecord | null): PublicBlogPost | null {
  if (!row) return null
  const featured = row.featured_image && typeof row.featured_image === 'object' ? row.featured_image as ApiRecord : null
  return {
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    body: String(row.body || ''),
    excerpt: typeof row.excerpt === 'string' ? row.excerpt : null,
    category: typeof row.category === 'string' ? row.category : null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : parseJson<string[]>(row.tags_json, []),
    featured_order: Number.isFinite(Number(row.featured_order)) ? Number(row.featured_order) : null,
    author_name: typeof row.author_name === 'string' ? row.author_name : null,
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
    canonical_url: typeof row.canonical_url === 'string' && row.canonical_url ? row.canonical_url : `/article/${String(row.slug)}`,
    seo_description: typeof row.seo_description === 'string' ? row.seo_description : null,
    robots: typeof row.robots === 'string' ? row.robots : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    components: Array.isArray(row.components) ? row.components as ApiRecord[] : [],
    author_image: typeof row.author_image === 'string' ? row.author_image : null,
    featured_image: featured && typeof featured.public_url === 'string'
      ? {
          public_url: featured.public_url,
          width: Number.isFinite(Number(featured.width)) ? Number(featured.width) : null,
          height: Number.isFinite(Number(featured.height)) ? Number(featured.height) : null,
        }
      : null,
  }
}

export async function getPublicBlawbyRouteData(
  db: DbClient,
  siteId: string,
  recipe: PublicBlawbyRouteData['recipe'],
  options: { slug?: string | null } = {},
): Promise<PublicBlawbyRouteData> {
  const needsOfferings = ['home', 'services', 'offering', 'about', 'pricing'].includes(recipe)
  const needsQa = ['home', 'services', 'about', 'pricing', 'contact', 'schedule', 'blog', 'donate'].includes(recipe)
  const needsReviews = ['home', 'offering', 'about', 'contact', 'schedule'].includes(recipe)
  const postLimit = recipe === 'home' ? 3 : recipe === 'blog' ? 50 : 0
  const pagePath = ROUTE_PAGE_PATHS[recipe]

  const [page, offerings, offering, qaRows, reviewRows, initialPosts, postRow] = await Promise.all([
    pagePath ? getPublicTenantPageByPath(db, siteId, pagePath) : Promise.resolve(null),
    needsOfferings ? listPublicOfferingSummaries(db, siteId) : Promise.resolve([]),
    recipe === 'offering' && options.slug
      ? getPublicOfferingBySlug(db, siteId, options.slug)
      : Promise.resolve(null),
    needsQa && pagePath ? listPageQa(db, siteId, pagePath, true) : Promise.resolve([]),
    needsReviews ? listSiteReviews(db, siteId, { publishedOnly: true }) : Promise.resolve([]),
    postLimit ? listPublicBlogSummaries(db, siteId, postLimit) : Promise.resolve([]),
    recipe === 'article' && options.slug
      ? getPublishedSiteBlogPost(db, siteId, options.slug)
      : Promise.resolve(null),
  ])
  let posts = initialPosts
  if (recipe === 'article' && postRow) {
    const postTags = Array.isArray(postRow.tags) ? postRow.tags.map(String) : parseJson<string[]>(postRow.tags_json, [])
    const summaries = await listPublicBlogSummaries(db, siteId, 50)
    posts = summaries
      .filter(summary => summary.slug !== options.slug && summary.tags.some(tag => postTags.includes(tag)))
      .slice(0, 3)
  }

  return {
    recipe,
    page,
    offerings,
    offering,
    qa: mapPublicQa(qaRows),
    reviews: mapPublicReviews(reviewRows),
    posts,
    post: mapPublicBlogPost(postRow),
  }
}

export async function getPublicBlawbyData(db: DbClient, siteId: string): Promise<PublicBlawbyData> {
  const [offerings, tenantPages, compliance, consultation, navigation, themeTokens] = await Promise.all([
    listPublicOfferings(db, siteId),
    listPublicTenantPages(db, siteId),
    getPublicCompliance(db, siteId),
    getPublicConsultationSettings(db, siteId),
    listPublicNavigationItems(db, siteId),
    getPublicThemeTokens(db, siteId),
  ])
  return { offerings, tenantPages, compliance, consultation, navigation, themeTokens }
}

export async function recordSiteConversionEvent(db: DbClient, input: {
  organizationId: string
  siteId: string
  eventName: SiteConversionEventName
  pageType?: string | null
  pagePath?: string | null
  pageLocation?: string | null
  ctaDestination?: string | null
  tenant?: string | null
  metadata?: ApiRecord | null
  ipHash?: string | null
  userAgent?: string | null
}) {
  const id = `conv_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  await execute(db, `
    INSERT INTO site_conversion_events
      (id, organization_id, site_id, event_name, page_type, page_path, page_location,
       cta_destination, tenant, metadata_json, ip_hash, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    input.organizationId,
    input.siteId,
    input.eventName,
    input.pageType ?? null,
    input.pagePath ?? null,
    input.pageLocation ?? null,
    input.ctaDestination ?? null,
    input.tenant ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    input.ipHash ?? null,
    input.userAgent ?? null,
  ])
  return { id }
}
