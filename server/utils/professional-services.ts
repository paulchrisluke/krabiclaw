import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import type {
  PublicBlawbyData,
  PublicCompliance,
  PublicConsultationSettings,
  PublicNavigationItem,
  PublicOffering,
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
}

type TenantPageRow = ApiRecord & {
  components_json: string | null
}

export async function listPublicOfferings(db: DbClient, siteId: string): Promise<PublicOffering[]> {
  const rows = await queryAll<OfferingRow>(db, `
    SELECT o.*,
           thumb.public_url AS thumbnail_url,
           hero.public_url AS hero_image_url
      FROM offerings o
      LEFT JOIN media_assets thumb ON o.thumbnail_asset_id = thumb.id AND thumb.status = 'active'
      LEFT JOIN media_assets hero ON o.hero_image_asset_id = hero.id AND hero.status = 'active'
     WHERE o.site_id = ? AND o.status = 'published'
     ORDER BY o.sort_order ASC, o.name ASC
  `, [siteId])

  const mediaIds = Array.from(new Set(rows.flatMap(row => parseJson<string[]>(row.media_asset_ids, []))))
  const mediaRows = mediaIds.length
    ? await queryAll<ApiRecord>(db, `
        SELECT id, public_url, kind, alt_text
          FROM media_assets
         WHERE id IN (${mediaIds.map(() => '?').join(',')}) AND status = 'active'
      `, mediaIds)
    : []
  const mediaById = new Map(mediaRows.map(row => [String(row.id), row]))

  return rows.map(row => {
    const ids = parseJson<string[]>(row.media_asset_ids, [])
    return {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      label: typeof row.label === 'string' ? row.label : null,
      summary: typeof row.summary === 'string' ? row.summary : null,
      short_description: typeof row.short_description === 'string' ? row.short_description : null,
      body: typeof row.body === 'string' ? row.body : null,
      features: parseJson<string[]>(row.features, []),
      faqs: parseJson<Array<{ question: string; answer: string }>>(row.faqs, []),
      cta_label: typeof row.cta_label === 'string' ? row.cta_label : null,
      cta_url: typeof row.cta_url === 'string' ? row.cta_url : null,
      thumbnail_url: row.thumbnail_url,
      hero_image_url: row.hero_image_url,
      media: ids.map(id => mediaById.get(id)).filter(Boolean).map(asset => ({
        id: String(asset!.id),
        url: String(asset!.public_url),
        kind: String(asset!.kind || 'image'),
        alt_text: typeof asset!.alt_text === 'string' ? String(asset!.alt_text) : null,
      })),
      schema_type: typeof row.schema_type === 'string' ? row.schema_type : null,
      seo_title: typeof row.seo_title === 'string' ? row.seo_title : null,
      seo_description: typeof row.seo_description === 'string' ? row.seo_description : null,
      canonical_path: typeof row.canonical_path === 'string' ? row.canonical_path : null,
      status: String(row.status),
      sort_order: Number(row.sort_order ?? 0),
      featured: asBoolean(row.featured),
    }
  })
}

export async function getPublicOfferingBySlug(db: DbClient, siteId: string, slug: string) {
  return (await listPublicOfferings(db, siteId)).find(offering => offering.slug === slug) ?? null
}

export async function listPublicTenantPages(db: DbClient, siteId: string): Promise<PublicTenantPage[]> {
  const rows = await queryAll<TenantPageRow>(db, `
    SELECT *
      FROM tenant_pages
     WHERE site_id = ? AND status = 'published'
     ORDER BY sort_order ASC, title ASC
  `, [siteId])

  return rows.map(row => ({
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
  }))
}

export async function getPublicTenantPageByPath(db: DbClient, siteId: string, path: string) {
  return (await listPublicTenantPages(db, siteId)).find(page => page.path === path) ?? null
}

export async function getPublicConsultationSettings(db: DbClient, siteId: string): Promise<PublicConsultationSettings> {
  const row = await queryFirst<ApiRecord>(db, `
    SELECT mode, cta_label, external_url, schedule_path, confirmation_path, tracking_enabled, metadata_json
      FROM site_consultation_settings
     WHERE site_id = ?
     LIMIT 1
  `, [siteId])

  return {
    mode: row?.mode === 'native_disabled' ? 'native_disabled' : 'external_url',
    cta_label: typeof row?.cta_label === 'string' && row.cta_label.trim() ? row.cta_label : 'Book a consultation',
    external_url: typeof row?.external_url === 'string' ? row.external_url : null,
    schedule_path: typeof row?.schedule_path === 'string' ? row.schedule_path : '/schedule',
    confirmation_path: typeof row?.confirmation_path === 'string' ? row.confirmation_path : '/contact/confirmed',
    tracking_enabled: row?.tracking_enabled == null ? true : asBoolean(row.tracking_enabled),
    metadata: parseJson<ApiRecord>(row?.metadata_json as string | null, {}),
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
    disclaimer: typeof row.disclaimer === 'string' ? row.disclaimer : null,
    footer_disclaimer: typeof row.footer_disclaimer === 'string' ? row.footer_disclaimer : null,
    document_asset_ids: documentAssetIds,
    documents: documentRows.map(document => ({
      id: String(document.id),
      url: String(document.public_url || ''),
      label: typeof document.alt_text === 'string' ? document.alt_text : null,
      file_name: typeof document.file_name === 'string' ? document.file_name : null,
    })),
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
  eventName: 'page_view' | 'book_consultation_click' | 'contact_submit'
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
