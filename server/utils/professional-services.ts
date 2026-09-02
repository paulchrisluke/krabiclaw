import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { HTTPError } from 'nitro';
import type { CloudflareEnv } from '~/server/utils/auth'
import { listPageQa } from '~/server/utils/location-qa'
import { listSiteReviews } from '~/server/utils/site-reviews'
import { loadPublicSocialMedia, type PublicSocialMedia } from '~/server/utils/public-social-image'
import { getPublishedSiteBlogPost } from '~/server/utils/platform-content'
import { siteSupportsBlawbyTemplate } from '~/utils/template-registry'
import {
  getPublicTenantPageForPath,
  listCanonicalTenantPages,
  listPublicTenantPageOfferingRows,
  type PublicTenantPageHydrationResources,
  type PublicTenantPageOfferingRow,
} from '~/server/utils/public-tenant-pages'
import { listPublishedTenantPagePaths } from '~/server/utils/tenant-pages'
import { isBlawbyShellOnlyRouteRecipe } from '~/types/blawby'
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
  PublicOffering,
  PublicOfferingFeature,
  PublicOfferingLink,
  PublicOfferingSummary,
  PublicSiteQa,
  PublicSiteReview,
  PublicTenantPage,
} from '~/types/blawby'

function asBoolean(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function requiredText(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new HTTPError({ statusCode: 500, statusMessage: `Stored ${field} is missing`, data: { code: 'INVALID_STORED_CONTENT', field } })
}

export function resolvePublicArticleCanonicalUrl(value: unknown, slug: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return `/article/${requiredText(slug, 'article.slug')}`
}

type OfferingRow = ApiRecord & {
  features: string | null
  faqs: string | null
  location_address: string | null
  location_city: string | null
}

export async function getActiveBlawbySite(db: DbClient, siteId: string): Promise<{ vertical: string; theme_id: string } | null> {
  const site = await queryFirst<{ vertical: string; theme_id: string }>(db, `
    SELECT vertical, theme_id
      FROM sites
     WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
     LIMIT 1
  `, [siteId])

  return siteSupportsBlawbyTemplate({ vertical: site?.vertical, themeId: site?.theme_id })
    ? site
    : null
}

async function getOfferingMedia(db: DbClient, siteId: string, offeringIds: string[]) {
  return await loadPublicSocialMedia(db, siteId, 'offering', offeringIds)
}

function mapOfferingRow(row: OfferingRow, socialMedia: PublicSocialMedia): PublicOffering {
  const media = socialMedia.media
  const rawFeatures = row.features ? JSON.parse(row.features) as ApiRecord[] : []
  const features: PublicOfferingFeature[] = rawFeatures.map((feature, index) => {
    if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
      throw new HTTPError({ statusCode: 500, statusMessage: `Stored offering ${row.id}.features[${index}] is invalid`, data: { code: 'INVALID_STORED_CONTENT' } })
    }
    const record = feature as ApiRecord
    return {
      title: requiredText(record.title ?? record.name, `offering ${row.id}.features[${index}].title`),
      description: requiredText(record.description ?? record.desc, `offering ${row.id}.features[${index}].description`),
      icon: typeof record.icon === 'string' ? record.icon : null,
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
    faqs: row.faqs ? JSON.parse(row.faqs) as { question: string; answer: string }[] : [],
    cta_label: typeof row.cta_label === 'string' ? row.cta_label : null,
    cta_url: typeof row.cta_url === 'string' ? row.cta_url : null,
    media: media.filter(asset => typeof asset.public_url === 'string' && asset.public_url).map(asset => ({
      asset_id: String(asset.asset_id),
      slot: String(asset.slot),
      public_url: String(asset.public_url),
      thumbnail_url: typeof asset.thumbnail_url === 'string' ? asset.thumbnail_url : null,
      kind: requiredText(asset.kind, `media asset ${asset.asset_id}.kind`),
      alt_text: typeof asset.alt_text === 'string' ? String(asset.alt_text) : null,
      width: Number.isFinite(Number(asset.width)) ? Number(asset.width) : null,
      height: Number.isFinite(Number(asset.height)) ? Number(asset.height) : null,
    })),
    social_image: socialMedia.social_image,
    schema_type: typeof row.schema_type === 'string' ? row.schema_type : null,
    seo_title: typeof row.seo_title === 'string' ? row.seo_title : null,
    seo_description: typeof row.seo_description === 'string' ? row.seo_description : null,
    canonical_path: typeof row.canonical_path === 'string' ? row.canonical_path : null,
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

export async function listPublicOfferings(db: DbClient, siteId: string): Promise<PublicOffering[]> {
  const rows = await queryAll<OfferingRow>(db, `
    SELECT o.*, loc.address AS location_address,
           loc.city AS location_city
      FROM offerings o
      LEFT JOIN business_locations loc ON o.location_id = loc.id AND loc.status = 'active'
     WHERE o.site_id = ?
     ORDER BY o.sort_order ASC, o.name ASC
  `, [siteId])

  const media = await getOfferingMedia(db, siteId, rows.map(row => String(row.id)))
  return rows.map(row => mapOfferingRow(row, media.get(String(row.id)) ?? { media: [], social_image: null }))
}

export async function listPublicOfferingLinks(db: DbClient, siteId: string): Promise<PublicOfferingLink[]> {
  const rows = await queryAll<ApiRecord>(db, `
    SELECT id, name, slug, canonical_path
      FROM offerings
     WHERE site_id = ?
     ORDER BY sort_order ASC, name ASC
  `, [siteId])

  return rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    canonical_path: requiredText(row.canonical_path, `offering ${row.id}.canonical_path`),
  }))
}

export async function listPublicOfferingSummaries(db: DbClient, siteId: string): Promise<PublicOfferingSummary[]> {
  return mapPublicOfferingSummaries(await listPublicTenantPageOfferingRows(db, siteId))
}

function mapPublicOfferingSummaries(rows: PublicTenantPageOfferingRow[]): PublicOfferingSummary[] {
  return rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    label: typeof row.label === 'string' ? row.label : null,
    summary: typeof row.summary === 'string' ? row.summary : null,
    short_description: typeof row.short_description === 'string' ? row.short_description : null,
    media: row.media.map(item => ({
      asset_id: item.asset_id,
      slot: item.slot,
      public_url: item.public_url,
      thumbnail_url: item.thumbnail_url,
      kind: item.kind,
      alt_text: item.alt_text,
    })),
    canonical_path: requiredText(row.canonical_path, `offering ${row.id}.canonical_path`),
    sort_order: Number(row.sort_order ?? 0),
    featured: asBoolean(row.featured),
  }))
}

export async function listPublicBlogSummaries(db: DbClient, siteId: string, limit = 50): Promise<PublicBlogSummary[]> {
  const rows = await queryAll<ApiRecord>(db, `
    SELECT p.id, p.title, p.slug, p.excerpt, p.category, p.tags_json, p.published_at, p.canonical_url, p.featured_order,
           featured.asset_id AS asset_id, media.public_url, media.thumbnail_url, media.kind, media.width, media.height
      FROM blog_posts p
      LEFT JOIN media_placements featured ON featured.owner_type = 'blog_post' AND featured.owner_id = p.id AND featured.slot = 'featured' AND featured.sort_order = 0 AND featured.status = 'active'
      LEFT JOIN media_assets media ON media.id = featured.asset_id AND media.status = 'active'
     WHERE p.site_id = ? AND p.status = 'published' AND p.visibility = 'public'
     ORDER BY COALESCE(p.featured_order, 999999), p.published_at IS NULL, p.published_at DESC, p.id DESC
     LIMIT ?
  `, [siteId, Math.max(1, Math.min(50, Math.trunc(limit)))])
  const socialMedia = await loadPublicSocialMedia(db, siteId, 'blog_post', rows.map(row => String(row.id)))
  return rows.map(row => ({
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    excerpt: typeof row.excerpt === 'string' ? row.excerpt : null,
    category: typeof row.category === 'string' ? row.category : null,
    tags: row.tags_json ? JSON.parse(row.tags_json) as string[] : [],
    featured_order: Number.isFinite(Number(row.featured_order)) ? Number(row.featured_order) : null,
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
    canonical_url: resolvePublicArticleCanonicalUrl(row.canonical_url, row.slug),
    media: typeof row.public_url === 'string' && row.public_url
      ? [{
          asset_id: String(row.asset_id),
          slot: 'featured',
          public_url: row.public_url,
          thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
          kind: typeof row.kind === 'string' ? row.kind : null,
          width: Number.isFinite(Number(row.width)) ? Number(row.width) : null,
          height: Number.isFinite(Number(row.height)) ? Number(row.height) : null,
        }]
      : [],
    social_image: socialMedia.get(String(row.id))?.social_image ?? null,
  }))
}

export async function getPublicOfferingBySlug(db: DbClient, siteId: string, slug: string): Promise<PublicOffering | null> {
  const row = await queryFirst<OfferingRow>(db, `
    SELECT o.*, loc.address AS location_address,
           loc.city AS location_city
      FROM offerings o
      LEFT JOIN business_locations loc ON o.location_id = loc.id AND loc.status = 'active'
     WHERE o.site_id = ? AND o.slug = ?
     LIMIT 1
  `, [siteId, slug])
  if (!row) return null
  const media = await getOfferingMedia(db, siteId, [String(row.id)])
  return mapOfferingRow(row, media.get(String(row.id)) ?? { media: [], social_image: null })
}

export async function listPublicTenantPages(db: DbClient, siteId: string): Promise<PublicTenantPage[]> {
  const pages = await listCanonicalTenantPages(db, siteId)
  return pages.map(page => ({
    id: page.id,
    page_id: page.page_id,
    path: page.path,
    title: page.title,
    page_type: page.page_type,
    recipe: page.recipe,
    locale: page.locale,
    summary: page.summary,
    seo_title: page.seo_title,
    seo_description: page.seo_description,
    canonical_url: page.canonical_url,
    robots: page.robots,
    blocks: page.blocks,
    media: page.media,
    social_image: page.social_image,
    updated_at: page.updated_at,
  }))
}

export async function getPublicTenantPageByPath(
  db: DbClient,
  siteId: string,
  path: string,
  hydrationResources?: PublicTenantPageHydrationResources,
): Promise<PublicTenantPage | null> {
  const page = await getPublicTenantPageForPath(db, siteId, path, { hydrationResources })
  if (!page) return null
  return {
    id: page.id,
    page_id: page.page_id,
    path: page.path,
    title: page.title,
    page_type: page.page_type,
    recipe: page.recipe,
    locale: page.locale,
    summary: page.summary,
    seo_title: page.seo_title,
    seo_description: page.seo_description,
    canonical_url: page.canonical_url,
    robots: page.robots,
    blocks: page.blocks,
    media: page.media,
    social_image: page.social_image,
    updated_at: page.updated_at,
  }
}

export async function getPublicConsultationSettings(db: DbClient, siteId: string): Promise<PublicConsultationSettings> {
  const row = await queryFirst<ApiRecord>(db, `
    SELECT mode, cta_label, external_url, schedule_path, confirmation_path, tracking_enabled, metadata_json
      FROM site_consultation_settings
     WHERE site_id = ?
     LIMIT 1
  `, [siteId])

  if (!row) throw new HTTPError({ statusCode: 500, statusMessage: 'Professional-service consultation settings are missing', data: { code: 'CONSULTATION_SETTINGS_MISSING' } })
  const metadata = row.metadata_json ? JSON.parse(row.metadata_json) as ApiRecord : {}
  const ctaLabel = requiredText(row.cta_label, 'consultation.cta_label')
  const schedulePath = requiredText(row.schedule_path, 'consultation.schedule_path')
  const confirmationPath = requiredText(row.confirmation_path, 'consultation.confirmation_path')
  if (row.mode !== 'native_disabled' && row.mode !== 'external_url') {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Professional-service consultation mode is invalid', data: { code: 'INVALID_STORED_CONTENT' } })
  }

  return {
    mode: row.mode,
    cta_label: ctaLabel,
    external_url: typeof row.external_url === 'string' ? row.external_url : null,
    schedule_path: schedulePath,
    confirmation_path: confirmationPath,
    tracking_enabled: row.tracking_enabled == null ? true : asBoolean(row.tracking_enabled),
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
  const mediaRows = await queryAll<ApiRecord>(db, `
    SELECT ma.id, ma.public_url, ma.kind, ma.alt_text, ma.file_name,
           mp.slot
      FROM media_placements mp
      JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
     WHERE mp.site_id = ? AND mp.owner_type = 'tenant_compliance' AND mp.owner_id = ?
       AND mp.slot = 'document' AND mp.status = 'active'
     ORDER BY mp.sort_order
  `, [siteId, String(row.id)])
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
    media: mediaRows.map(item => ({
      asset_id: String(item.id),
      slot: String(item.slot),
      public_url: typeof item.public_url === 'string' && item.public_url ? item.public_url : null,
      kind: typeof item.kind === 'string' ? item.kind : null,
      alt_text: typeof item.alt_text === 'string' ? item.alt_text : null,
      file_name: typeof item.file_name === 'string' ? item.file_name : null,
    })),
    founder_name: typeof row.founder_name === 'string' ? row.founder_name : null,
    founding_date: typeof row.founding_date === 'string' ? row.founding_date : null,
    same_as: row.same_as ? JSON.parse(row.same_as) as string[] : [],
    contact_points: row.contact_points ? JSON.parse(row.contact_points) as PublicComplianceContactPoint[] : [],
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
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) as ApiRecord : {},
  }
}



export async function getPublicThemeTokens(db: DbClient, siteId: string, templateSlug = 'blawby'): Promise<ApiRecord> {
  const row = await queryFirst<{ tokens_json: string | null }>(db, `
    SELECT tokens_json
      FROM site_theme_tokens
     WHERE site_id = ? AND template_slug = ? AND status = 'active'
     LIMIT 1
  `, [siteId, templateSlug])
  return row?.tokens_json ? JSON.parse(row.tokens_json) as ApiRecord : {}
}

export async function getPublicBlawbyIdentity(db: DbClient, siteId: string): Promise<PublicBlawbyIdentity> {
  const row = await queryFirst<ApiRecord>(db, `
    SELECT s.brand_name, s.brand_description, s.contact_phone,
           primary_loc.address AS primary_location_address,
           primary_loc.city AS primary_location_city
      FROM sites s
      LEFT JOIN business_locations primary_loc ON s.primary_location_id = primary_loc.id AND primary_loc.status = 'active'
     WHERE s.id = ?
     LIMIT 1
  `, [siteId])
  const socialMedia = (await loadPublicSocialMedia(db, siteId, 'site', [siteId])).get(siteId)

  return {
    brand_name: requiredText(row?.brand_name, `site ${siteId}.brand_name`),
    brand_description: typeof row?.brand_description === 'string' ? row.brand_description : null,
    media: (socialMedia?.media ?? []).map(item => ({ asset_id: item.asset_id, slot: item.slot, public_url: item.public_url, thumbnail_url: item.thumbnail_url, kind: item.kind })),
    social_image: socialMedia?.social_image ?? null,
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
  const [identity, consultation, compliance, themeTokens, offeringLinks, pageLinks] = await Promise.all([
    getPublicBlawbyIdentity(db, siteId),
    getPublicConsultationSettings(db, siteId),
    getPublicCompliance(db, siteId),
    getPublicThemeTokens(db, siteId),
    listPublicOfferingLinks(db, siteId),
    listPublishedTenantPagePaths(db, siteId),
  ])
  const header = compliance?.metadata?.header
  if (header && typeof header === 'object') {
    identity.banner_content = typeof (header as ApiRecord).banner_content === 'string' ? String((header as ApiRecord).banner_content) : null
    identity.banner_dismissible = asBoolean((header as ApiRecord).banner_dismissible)
  }
  return {
    identity,
    consultation,
    compliance,
    themeTokens,
    offeringLinks,
    pageLinks: pageLinks.map(page => ({ id: page.id, path: page.path, title: page.title })),
  }
}

export async function getPublicBlawbyDocumentData(
  db: DbClient,
  siteId: string,
  recipe: PublicBlawbyRouteData['recipe'],
  options: { slug?: string | null } = {},
  env: CloudflareEnv,
): Promise<{ shell: PublicBlawbyShellData; route: PublicBlawbyRouteData } | null> {
  const site = await getActiveBlawbySite(db, siteId)
  if (!site) return null

  const [shell, route] = await Promise.all([
    getPublicBlawbyShellData(db, siteId),
    getPublicBlawbyRouteData(db, siteId, recipe, options, env),
  ])
  return { shell, route }
}

export async function resolvePublicBlawbyDocumentOrThrow(
  db: DbClient,
  siteId: string,
  recipe: PublicBlawbyRouteData['recipe'],
  options: { slug?: string | null } = {},
  env: CloudflareEnv,
): Promise<{ success: true; shell: PublicBlawbyShellData; route: PublicBlawbyRouteData }> {
  const document = await getPublicBlawbyDocumentData(db, siteId, recipe, options, env)
  if (!document) {
    throw new HTTPError({
      statusCode: 404,
      statusMessage: 'Blawby is not enabled for this site',
      data: { code: 'BLAWBY_NOT_ENABLED' },
    })
  }
  if (!hasPublicBlawbyRouteContent(document.route)) {
    throw new HTTPError({
      statusCode: 404,
      statusMessage: 'Route content not found',
      data: { code: 'BLAWBY_ROUTE_NOT_FOUND' },
    })
  }
  return { success: true, ...document }
}

const ROUTE_PAGE_PATHS: Record<PublicBlawbyRouteData['recipe'], string | null> = {
  home: '/',
  links: null,
  services: '/services',
  offering: '/services',
  about: '/about',
  pricing: '/pricing',
  contact: '/contact',
  confirmation: null,
  schedule: '/schedule',
  blog: '/blog',
  article: '/blog',
  donate: '/donate',
  privacy: '/policies/privacy',
  terms: '/policies/terms',
  'third-party-notices': '/third-party-notices',
}

function mapPublicQa(rows: Array<{
  id: unknown
  question: unknown
  answer?: unknown
  sort_order?: unknown
}>): PublicSiteQa[] {
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
    author_name: requiredText(row.author_name, `review ${row.id}.author_name`),
    media: Array.isArray(row.media) ? row.media as PublicSiteReview['media'] : [],
    rating: Number(row.rating),
    title: typeof row.title === 'string' ? row.title : null,
    content: requiredText(row.content, `review ${row.id}.content`),
    original_review_date: typeof row.original_review_date === 'string' ? row.original_review_date : null,
    verified: row.verified === true,
  }))
}

function mapPublicBlogPost(row: ApiRecord | null): PublicBlogPost | null {
  if (!row) return null
  const media = Array.isArray(row.media) ? row.media as ApiRecord[] : []
  return {
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    body: requiredText(row.body, `article ${row.id}.body`),
    author: row.author && typeof row.author === 'object' && !Array.isArray(row.author)
      ? {
          id: String((row.author as ApiRecord).id),
          name: typeof (row.author as ApiRecord).name === 'string' ? String((row.author as ApiRecord).name) : null,
          image: typeof (row.author as ApiRecord).image === 'string' ? String((row.author as ApiRecord).image) : null,
        }
      : null,
    excerpt: typeof row.excerpt === 'string' ? row.excerpt : null,
    category: typeof row.category === 'string' ? row.category : null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : (row.tags_json ? JSON.parse(row.tags_json) as string[] : []),
    featured_order: Number.isFinite(Number(row.featured_order)) ? Number(row.featured_order) : null,
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
    canonical_url: resolvePublicArticleCanonicalUrl(row.canonical_url, row.slug),
    seo_title: typeof row.seo_title === 'string' ? row.seo_title : null,
    seo_description: typeof row.seo_description === 'string' ? row.seo_description : null,
    robots: typeof row.robots === 'string' ? row.robots : null,
    visibility: row.visibility === 'unlisted' ? 'unlisted' : 'public',
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    content_blocks: Array.isArray(row.content_blocks) ? row.content_blocks as import('~/lib/components/workspace/blog/types').BlogEditorBlock[] : [],
    media: media.map(item => ({
      asset_id: String(item.asset_id),
      slot: String(item.slot),
      public_url: requiredText(item.public_url, `article ${row.id}.media.public_url`),
      thumbnail_url: typeof item.thumbnail_url === 'string' ? item.thumbnail_url : null,
      kind: typeof item.kind === 'string' ? item.kind : null,
      width: Number.isFinite(Number(item.width)) ? Number(item.width) : null,
      height: Number.isFinite(Number(item.height)) ? Number(item.height) : null,
    })),
    social_image: row.social_image && typeof row.social_image === 'object'
      ? row.social_image as import('~/utils/social-metadata').SocialImageSource
      : null,
  }
}

export async function getPublicBlawbyRouteData(
  db: DbClient,
  siteId: string,
  recipe: PublicBlawbyRouteData['recipe'],
  options: { slug?: string | null } = {},
  env: CloudflareEnv,
): Promise<PublicBlawbyRouteData> {
  const needsOfferings = ['home', 'services', 'offering', 'about', 'pricing'].includes(recipe)
  const needsQa = ['home', 'services', 'about', 'pricing', 'contact', 'schedule', 'blog', 'donate'].includes(recipe)
  const needsReviews = ['home', 'offering', 'about', 'contact', 'schedule'].includes(recipe)
  const postLimit = recipe === 'home' ? 3 : recipe === 'blog' ? 50 : 0
  const pagePath = ROUTE_PAGE_PATHS[recipe]
  const offeringRowsPromise = needsOfferings
    ? listPublicTenantPageOfferingRows(db, siteId)
    : Promise.resolve([])
  const qaRowsPromise = needsQa && pagePath
    ? listPageQa(db, siteId, pagePath, true)
    : Promise.resolve([])

  const [page, offeringRows, offering, qaRows, reviewRows, initialPosts, postRow] = await Promise.all([
    pagePath
      ? getPublicTenantPageByPath(db, siteId, pagePath, {
          offerings: needsOfferings ? offeringRowsPromise : undefined,
          qaRows: needsQa ? qaRowsPromise : undefined,
        })
      : Promise.resolve(null),
    offeringRowsPromise,
    recipe === 'offering' && options.slug
      ? getPublicOfferingBySlug(db, siteId, options.slug)
      : Promise.resolve(null),
    qaRowsPromise,
    needsReviews ? listSiteReviews(db, siteId, { publishedOnly: true }) : Promise.resolve([]),
    postLimit ? listPublicBlogSummaries(db, siteId, postLimit) : Promise.resolve([]),
    recipe === 'article' && options.slug
      ? getPublishedSiteBlogPost(db, siteId, options.slug, env)
      : Promise.resolve(null),
  ])
  const offerings = mapPublicOfferingSummaries(offeringRows)
  let posts = initialPosts
  if (recipe === 'article' && postRow) {
    const postTags = Array.isArray(postRow.tags) ? postRow.tags.map(String) : (postRow.tags_json ? JSON.parse(postRow.tags_json) as string[] : [])
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
    reviews: mapPublicReviews(reviewRows as unknown as Array<Record<string, unknown>>),
    posts,
    post: mapPublicBlogPost(postRow),
  }
}

export function hasPublicBlawbyRouteContent(route: PublicBlawbyRouteData): boolean {
  if (route.recipe === 'confirmation' || isBlawbyShellOnlyRouteRecipe(route.recipe)) return true
  if (route.recipe === 'offering') return Boolean(route.offering)
  if (route.recipe === 'article') return Boolean(route.post)
  return Boolean(route.page)
}

export async function getPublicBlawbyData(db: DbClient, siteId: string): Promise<PublicBlawbyData> {
  const [offerings, tenantPages, compliance, consultation, themeTokens] = await Promise.all([
    listPublicOfferings(db, siteId),
    listPublicTenantPages(db, siteId),
    getPublicCompliance(db, siteId),
    getPublicConsultationSettings(db, siteId),
    getPublicThemeTokens(db, siteId),
  ])
  return { offerings, tenantPages, compliance, consultation, themeTokens }
}
