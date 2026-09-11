import { parseGoogleReviewMetadata } from '~/shared/google-review'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { HTTPError } from 'nitro';
import type { CloudflareEnv } from '~/server/utils/auth'
import { parseSocialImageSource } from '~/utils/social-metadata'
import { listSiteReviews } from '~/server/utils/site-reviews'
import { getPublishedLocalizedSiteBlogPost } from '~/server/utils/content/publishing'
import { COVER_SELECT, attachCoverMedia, coverJoinSql } from '~/server/utils/content/cover'
import {
  loadExactPublicLocalizations,
  type ExactPublicLocalization,
} from '~/server/utils/public-localization'
import { loadPublicSocialMedia } from '~/server/utils/public-social-image'
import { listPublicLocaleRepresentations } from '~/server/utils/public-locale-representations'
import { siteSupportsBlawbyTemplate } from '~/utils/template-registry'
import {
  getPublicTenantPageForPath,
  listCanonicalTenantPages,
  type PublicTenantPageHydrationResources,
} from '~/server/utils/public-tenant-pages'
import { listPublishedTenantPagePaths } from '~/server/utils/content/pages'
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

export async function getActiveBlawbySite(db: DbClient, siteId: string): Promise<{ organization_id: string; vertical: string; theme_id: string } | null> {
  const site = await queryFirst<{ organization_id: string; vertical: string; theme_id: string }>(db, `
    SELECT organization_id, vertical, theme_id
      FROM sites
     WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
     LIMIT 1
  `, [siteId])

  return siteSupportsBlawbyTemplate({ vertical: site?.vertical, themeId: site?.theme_id })
    ? site
    : null
}

export async function listPublicBlogSummaries(db: DbClient, siteId: string, limit = 50, locale = 'en'): Promise<PublicBlogSummary[]> {
  const rows = await queryAll<ApiRecord>(db, `
    SELECT root.id, p.id AS representation_id, p.title, p.slug, p.summary AS excerpt, p.metadata_json ->> '$.category' AS category,
           p.metadata_json ->> '$.tags' AS tags_json, root.published_at, p.canonical_url, p.path,
           ${COVER_SELECT}
      FROM content_documents root JOIN content_documents p ON COALESCE(p.root_id,p.id) = root.id AND p.locale = ?
      ${coverJoinSql('p')}
     WHERE root.site_id = ? AND root.kind = 'article' AND root.row_role = 'root' AND root.status = 'published' AND root.visibility = 'public'
     ORDER BY root.published_at IS NULL, root.published_at DESC, root.id DESC
     LIMIT ?
  `, [locale, siteId, Math.max(1, Math.min(50, Math.trunc(limit)))])
  const socialMedia = await loadPublicSocialMedia(db, siteId, 'content_document', rows.map(row => String(row.representation_id)))
  return rows.map(row => ({
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    excerpt: typeof row.excerpt === 'string' ? row.excerpt : null,
    category: typeof row.category === 'string' ? row.category : null,
    tags: row.tags_json ? JSON.parse(row.tags_json) as string[] : [],
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
    canonical_url: locale === 'en' ? resolvePublicArticleCanonicalUrl(row.canonical_url, row.slug) : `/${locale}${requiredText(row.path, 'localized article path')}`,
    cover: attachCoverMedia(row).cover,
    social_image: socialMedia.get(String(row.representation_id))?.social_image ?? null,
  }))
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
    sort_order: page.sort_order,
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
  options: {
    locale?: string | null
    hydrationResources?: PublicTenantPageHydrationResources
    localizations?: readonly ExactPublicLocalization[] | null
  } = {},
): Promise<PublicTenantPage | null> {
  const page = await getPublicTenantPageForPath(db, siteId, path, options)
  if (!page) return null
  return {
    id: page.id,
    page_id: page.page_id,
    path: page.path,
    title: page.title,
    page_type: page.page_type,
    recipe: page.recipe,
    sort_order: page.sort_order,
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
    SELECT json_extract(settings_json, '$.consultation.mode') AS mode,
           json_extract(settings_json, '$.consultation.cta_label') AS cta_label,
           json_extract(settings_json, '$.consultation.external_url') AS external_url,
           json_extract(settings_json, '$.consultation.schedule_path') AS schedule_path,
           json_extract(settings_json, '$.consultation.confirmation_path') AS confirmation_path,
           json_extract(settings_json, '$.consultation.tracking_enabled') AS tracking_enabled,
           json_extract(settings_json, '$.consultation.metadata_json') AS metadata_json
      FROM sites
     WHERE id = ? AND json_type(settings_json, '$.consultation') = 'object'
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
    SELECT json_extract(settings_json, '$.compliance.entity_name') AS entity_name,
           json_extract(settings_json, '$.compliance.dba_name') AS dba_name,
           json_extract(settings_json, '$.compliance.entity_type') AS entity_type,
           json_extract(settings_json, '$.compliance.nonprofit_status') AS nonprofit_status,
           json_extract(settings_json, '$.compliance.registration_number') AS registration_number,
           json_extract(settings_json, '$.compliance.service_area') AS service_area,
           json_extract(settings_json, '$.compliance.service_area_type') AS service_area_type,
           json_extract(settings_json, '$.compliance.disclaimer') AS disclaimer,
           json_extract(settings_json, '$.compliance.footer_disclaimer') AS footer_disclaimer,
           json_extract(settings_json, '$.compliance.founder_name') AS founder_name,
           json_extract(settings_json, '$.compliance.founding_date') AS founding_date,
           json_extract(settings_json, '$.compliance.same_as') AS same_as,
           json_extract(settings_json, '$.compliance.contact_points') AS contact_points,
           json_extract(settings_json, '$.compliance.address_visibility') AS address_visibility,
           json_extract(settings_json, '$.compliance.metadata_json') AS metadata_json
      FROM sites
     WHERE id = ? AND json_type(settings_json, '$.compliance') = 'object'
     LIMIT 1
  `, [siteId])
  if (!row) return null
  const mediaRows = await queryAll<ApiRecord>(db, `
    SELECT ma.id, ma.public_url, ma.kind, ma.alt_text, ma.file_name,
           mp.slot
      FROM media_placements mp
      JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
     WHERE mp.site_id = ? AND mp.owner_type = 'site' AND mp.owner_id = ?
       AND mp.slot = 'compliance_document' AND mp.status = 'active'
     ORDER BY mp.sort_order
  `, [siteId, siteId])
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
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) as ApiRecord : {},
  }
}



export async function getPublicThemeTokens(db: DbClient, siteId: string, templateSlug = 'blawby'): Promise<ApiRecord> {
  const row = await queryFirst<{ tokens_json: string | null }>(db, `
    SELECT json_extract(settings_json, ? || '.tokens') AS tokens_json
      FROM sites
     WHERE id = ? AND json_extract(settings_json, ? || '.status') = 'active'
     LIMIT 1
  `, ['$.theme_by_template.' + templateSlug, siteId, '$.theme_by_template.' + templateSlug])
  return row?.tokens_json ? JSON.parse(row.tokens_json) as ApiRecord : {}
}

export async function getPublicBlawbyIdentity(db: DbClient, siteId: string): Promise<PublicBlawbyIdentity> {
  const row = await queryFirst<ApiRecord>(db, `
    SELECT s.brand_name, s.brand_description, s.contact_phone
      FROM sites s
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
  }
}

export async function getPublicBlawbyShellData(
  db: DbClient,
  siteId: string,
  options: { locale?: string | null; localizations?: readonly ExactPublicLocalization[] } = {},
): Promise<PublicBlawbyShellData> {
  const locale = options.locale?.trim() || 'en'
  const localizations = options.localizations ?? []
  const siteLocalization = localizations.find(item => item.resourceType === 'site' && item.resourceId === siteId) ?? null
  // Navigation is the site's published pages. A practice area is one of them,
  // so there is no separate link list to keep in step with the page list.
  const [sourceIdentity, sourceConsultation, sourceCompliance, themeTokens, pageLinks] = await Promise.all([
    getPublicBlawbyIdentity(db, siteId),
    getPublicConsultationSettings(db, siteId),
    getPublicCompliance(db, siteId),
    getPublicThemeTokens(db, siteId),
    listPublishedTenantPagePaths(db, siteId, locale),
  ])
  const localizedRepresentation = locale !== 'en'
  const identity = localizedRepresentation
    ? {
        ...sourceIdentity,
        brand_name: typeof siteLocalization?.values.brand_name === 'string' ? siteLocalization.values.brand_name : '',
        brand_description: typeof siteLocalization?.values.brand_description === 'string' ? siteLocalization.values.brand_description : null,
      }
    : sourceIdentity
  let consultation = sourceConsultation
  let compliance = sourceCompliance
  if (localizedRepresentation) {
    const consultationValues = siteLocalization?.values.consultation as { cta_label?: unknown } | undefined
    consultation = {
      ...sourceConsultation,
      cta_label: typeof consultationValues?.cta_label === 'string' ? consultationValues.cta_label : '',
      metadata: { ...sourceConsultation.metadata, header_cta_label: null },
    }
    const complianceValues = siteLocalization?.values.compliance as { service_area?: unknown; disclaimer?: unknown; footer_disclaimer?: unknown } | undefined
    compliance = sourceCompliance
      ? {
          ...sourceCompliance,
          service_area: typeof complianceValues?.service_area === 'string' ? complianceValues.service_area : null,
          disclaimer: typeof complianceValues?.disclaimer === 'string' ? complianceValues.disclaimer : null,
          footer_disclaimer: typeof complianceValues?.footer_disclaimer === 'string' ? complianceValues.footer_disclaimer : null,
          metadata: { ...sourceCompliance.metadata, header: null },
          media: sourceCompliance.media.map(item => ({ ...item, alt_text: null, file_name: null })),
        }
      : null
  }
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
    pageLinks: pageLinks.map(page => ({ id: page.id, path: page.path, title: page.title })),
  }
}

export async function getPublicBlawbyDocumentData(
  db: DbClient,
  siteId: string,
  recipe: PublicBlawbyRouteData['recipe'],
  options: { token?: string; slug?: string | null; locale?: string | null } = {},
  env: CloudflareEnv,
): Promise<{ shell: PublicBlawbyShellData; route: PublicBlawbyRouteData } | null> {
  const site = await getActiveBlawbySite(db, siteId)
  if (!site) return null
  const locale = options.locale?.trim() || 'en'
  const localizations = locale === 'en'
    ? []
    : await loadExactPublicLocalizations(db, site.organization_id, siteId, locale)

  const [shell, route] = await Promise.all([
    getPublicBlawbyShellData(db, siteId, { locale, localizations }),
    getPublicBlawbyRouteData(db, siteId, recipe, { ...options, locale, localizations }, env),
  ])
  const pagePath = ROUTE_PAGE_PATHS[recipe]
  if (recipe === 'article') return { shell, route }
  // Every route on this template is a page now, so locale representations
  // come from the document — there is no second resource kind to branch on.
  route.localeRepresentations = await listPublicLocaleRepresentations(db, {
    organizationId: site.organization_id,
    siteId,
    sourcePath: pagePath ?? '/',
    documentId: route.page?.page_id,
  })
  return { shell, route }
}

export async function resolvePublicBlawbyDocumentOrThrow(
  db: DbClient,
  siteId: string,
  recipe: PublicBlawbyRouteData['recipe'],
  options: { token?: string; slug?: string | null; locale?: string | null } = {},
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
  about: '/about',
  pricing: '/pricing',
  contact: '/contact',
  confirmation: null,
  schedule: '/schedule',
  blog: '/blog',
  article: null,
  donate: '/donate',
  privacy: '/policies/privacy',
  terms: '/policies/terms',
  'third-party-notices': '/third-party-notices',
}
function faqBlockQa(page: { blocks: Array<{ type: string; data: Record<string, unknown> }> } | null): PublicSiteQa[] {
  const block = page?.blocks.find(candidate => candidate.type === 'faq')
  if (!block || !Array.isArray(block.data.items)) return []
  return block.data.items.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.title !== 'string') return []
    return [{ id: record.id, question: record.title, answer: typeof record.description === 'string' ? record.description : null, sort_order: index }]
  })
}

type SiteReviewRow = Awaited<ReturnType<typeof listSiteReviews>>[number]

function mapPublicReviews(rows: SiteReviewRow[]): PublicSiteReview[] {
  return rows.map(row => ({
    id: String(row.id),
    author_name: requiredText(row.author_name, `review ${row.id}.author_name`),
    media: row.media,
    rating: Number(row.rating),
    title: typeof row.title === 'string' ? row.title : null,
    content: requiredText(row.content, `review ${row.id}.content`),
    original_review_date: typeof row.original_review_date === 'string' ? row.original_review_date : null,
    verified: row.verified === true,
    source: typeof row.source === 'string' ? row.source : null,
    original_reference: typeof row.original_reference === 'string' ? row.original_reference : null,
    google_review_metadata: parseGoogleReviewMetadata(row.google_review_metadata),
  }))
}

function mapPublicBlogPost(row: ApiRecord | null): PublicBlogPost | null {
  if (!row) return null
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
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
    canonical_url: resolvePublicArticleCanonicalUrl(row.canonical_url, row.slug),
    seo_title: typeof row.seo_title === 'string' ? row.seo_title : null,
    seo_description: typeof row.seo_description === 'string' ? row.seo_description : null,
    robots: typeof row.robots === 'string' ? row.robots : null,
    visibility: row.visibility === 'unlisted' ? 'unlisted' : 'public',
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    content_blocks: Array.isArray(row.content_blocks) ? row.content_blocks as import('~/lib/components/workspace/blog/types').BlogEditorBlock[] : [],
    cover: row.cover && typeof row.cover === 'object' && !Array.isArray(row.cover)
      ? {
          asset_id: String((row.cover as ApiRecord).asset_id),
          public_url: typeof (row.cover as ApiRecord).public_url === 'string' ? String((row.cover as ApiRecord).public_url) : null,
          thumbnail_url: typeof (row.cover as ApiRecord).thumbnail_url === 'string' ? String((row.cover as ApiRecord).thumbnail_url) : null,
          kind: typeof (row.cover as ApiRecord).kind === 'string' ? String((row.cover as ApiRecord).kind) : null,
          alt_text: typeof (row.cover as ApiRecord).alt_text === 'string' ? String((row.cover as ApiRecord).alt_text) : null,
          width: typeof (row.cover as ApiRecord).width === 'number' && Number.isFinite((row.cover as ApiRecord).width) ? Number((row.cover as ApiRecord).width) : null,
          height: typeof (row.cover as ApiRecord).height === 'number' && Number.isFinite((row.cover as ApiRecord).height) ? Number((row.cover as ApiRecord).height) : null,
        }
      : null,
    social_image: parseSocialImageSource(row.social_image),
  }
}

export async function getPublicBlawbyRouteData(
  db: DbClient,
  siteId: string,
  recipe: PublicBlawbyRouteData['recipe'],
  options: { token?: string; slug?: string | null; locale?: string | null; localizations?: readonly ExactPublicLocalization[] } = {},
  env: CloudflareEnv,
): Promise<PublicBlawbyRouteData> {
  const needsReviews = ['home', 'about', 'contact', 'schedule'].includes(recipe)
  const postLimit = recipe === 'home' ? 3 : recipe === 'blog' ? 50 : 0
  const pagePath = ROUTE_PAGE_PATHS[recipe]
  const localized = options.locale !== undefined && options.locale !== 'en'

  const [page, reviewRows, initialPosts, postRow] = await Promise.all([
    pagePath
      ? getPublicTenantPageByPath(db, siteId, pagePath, {
          locale: options.locale,
          localizations: localized ? options.localizations ?? [] : null,
        })
      : Promise.resolve(null),
    needsReviews ? listSiteReviews(db, siteId, { publishedOnly: true }) : Promise.resolve([]),
    postLimit ? listPublicBlogSummaries(db, siteId, postLimit, options.locale ?? 'en') : Promise.resolve([]),
    recipe === 'article' && options.slug
      ? getPublishedLocalizedSiteBlogPost(db, siteId, options.slug, options.locale ?? 'en', env, options.token)
      : Promise.resolve(null),
  ])
  let posts = initialPosts
  if (recipe === 'article' && postRow) {
    if (localized) posts = []
    else {
      const postTags = Array.isArray(postRow.tags) ? postRow.tags.map(String) : (postRow.tags_json ? JSON.parse(postRow.tags_json) as string[] : [])
      const summaries = await listPublicBlogSummaries(db, siteId, 50)
      posts = summaries
        .filter(summary => summary.id !== postRow.id && summary.tags.some(tag => postTags.includes(tag)))
        .slice(0, 3)
    }
  }

  // The Blawby layouts render one FAQ section, from the page's FAQ block; the
  // route data carries that block's items, as its declared source resolved them.
  const qa = faqBlockQa(page)
  const resolvedPost = mapPublicBlogPost(postRow)
  return {
    recipe,
    localeRepresentations: postRow?.localeRepresentations ?? [],
    page,
    qa,
    reviews: mapPublicReviews(reviewRows),
    posts,
    post: resolvedPost,
  }
}

export function hasPublicBlawbyRouteContent(route: PublicBlawbyRouteData): boolean {
  if (route.recipe === 'confirmation' || isBlawbyShellOnlyRouteRecipe(route.recipe)) return true
  if (route.recipe === 'article') return Boolean(route.post)
  return Boolean(route.page)
}

export async function getPublicBlawbyData(db: DbClient, siteId: string): Promise<PublicBlawbyData> {
  const [tenantPages, compliance, consultation, themeTokens] = await Promise.all([
    listPublicTenantPages(db, siteId),
    getPublicCompliance(db, siteId),
    getPublicConsultationSettings(db, siteId),
    getPublicThemeTokens(db, siteId),
  ])
  return { tenantPages, compliance, consultation, themeTokens }
}
