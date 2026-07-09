import { executeBatch, type BatchQuery, type DbClient } from '~/server/db'
import { cleanString } from '~/server/utils/api-response'
import { getPublicBlawbyData } from '~/server/utils/professional-services'

function json(value: unknown) {
  return JSON.stringify(value ?? null)
}

function idWith(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

function recordArray(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.filter((item): item is ApiRecord => typeof item === 'object' && item !== null) : []
}

function assertNoArbitraryCalculatorLogic(value: unknown, path = 'calculator') {
  if (value == null) return
  if (typeof value === 'string') {
    if (/\b(function|eval|new Function|script|formula|expression|javascript:)\b|=>/i.test(value)) {
      throw new Error(`${path} contains arbitrary calculator logic. Use structured ranges, fees, and source metadata.`)
    }
    return
  }
  if (typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoArbitraryCalculatorLogic(item, `${path}[${index}]`))
    return
  }
  for (const [key, nested] of Object.entries(value)) {
    if (/^(formula|expression|script|function|code|javascript)$/i.test(key)) {
      throw new Error(`${path}.${key} is not allowed. Calculator components must be structured data, not executable logic.`)
    }
    assertNoArbitraryCalculatorLogic(nested, `${path}.${key}`)
  }
}

export function validateProfessionalServicePayload(body: ApiRecord) {
  for (const page of recordArray(body.tenantPages)) {
    for (const component of recordArray(page.components)) {
      if (component.type !== 'pricing_calculator') continue
      assertNoArbitraryCalculatorLogic(component)
      const hasSource = Boolean(
        cleanString(component.source, 300) ||
        cleanString(component.source_url, 500) ||
        cleanString((component.table as ApiRecord | undefined)?.source, 300) ||
        cleanString(component.effective_date, 80) ||
        cleanString((component.table as ApiRecord | undefined)?.effectiveDate, 80),
      )
      if (!hasSource) {
        throw new Error('pricing_calculator needs source or effective date metadata.')
      }
    }
  }
}

export async function getProfessionalServiceContent(db: DbClient, siteId: string) {
  return getPublicBlawbyData(db, siteId)
}

export async function upsertProfessionalServiceContent(
  db: DbClient,
  input: {
    organizationId: string
    siteId: string
    data: ApiRecord
    updatedBy?: string | null
  },
) {
  validateProfessionalServicePayload(input.data)
  const { organizationId, siteId, data, updatedBy = null } = input
  const written: Record<string, number> = {}
  const statements: BatchQuery[] = []

  for (const item of recordArray(data.offerings)) {
    const id = cleanString(item.id, 80) || idWith('offering')
    const name = cleanString(item.name, 200)
    const slug = cleanString(item.slug, 180)
    if (!name || !slug) throw new Error('Each offering needs name and slug.')
    statements.push({
      query: `
      INSERT INTO offerings
        (id, organization_id, site_id, location_id, name, slug, label, summary, short_description, body,
         features, faqs, cta_label, cta_url, thumbnail_asset_id, hero_image_asset_id,
         media_asset_ids, schema_type, seo_title, seo_description, canonical_path,
         status, sort_order, featured, source, source_ref, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(organization_id, site_id, slug) DO UPDATE SET
        location_id = excluded.location_id, name = excluded.name, label = excluded.label,
        summary = excluded.summary, short_description = excluded.short_description, body = excluded.body,
        features = excluded.features, faqs = excluded.faqs, cta_label = excluded.cta_label,
        cta_url = excluded.cta_url, thumbnail_asset_id = excluded.thumbnail_asset_id,
        hero_image_asset_id = excluded.hero_image_asset_id, media_asset_ids = excluded.media_asset_ids,
        schema_type = excluded.schema_type, seo_title = excluded.seo_title,
        seo_description = excluded.seo_description, canonical_path = excluded.canonical_path,
        status = excluded.status, sort_order = excluded.sort_order, featured = excluded.featured,
        source = excluded.source, source_ref = excluded.source_ref, updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `,
      params: [
        id,
        organizationId,
        siteId,
        cleanString(item.location_id, 120) || null,
        name,
        slug,
        cleanString(item.label, 120) || null,
        cleanString(item.summary, 500) || null,
        cleanString(item.short_description, 1000) || null,
        typeof item.body === 'string' ? item.body : null,
        json(Array.isArray(item.features) ? item.features : []),
        json(Array.isArray(item.faqs) ? item.faqs : []),
        cleanString(item.cta_label, 120) || null,
        cleanString(item.cta_url, 500) || null,
        cleanString(item.thumbnail_asset_id, 120) || null,
        cleanString(item.hero_image_asset_id, 120) || null,
        json(Array.isArray(item.media_asset_ids) ? item.media_asset_ids : []),
        cleanString(item.schema_type, 120) || 'Service',
        cleanString(item.seo_title, 200) || null,
        cleanString(item.seo_description, 500) || null,
        cleanString(item.canonical_path, 300) || `/services/${slug}`,
        cleanString(item.status, 30) || 'published',
        Number(item.sort_order ?? 0),
        item.featured ? 1 : 0,
        cleanString(item.source, 80) || 'manual',
        cleanString(item.source_ref, 300) || null,
        updatedBy,
      ],
    })
    written.offerings = (written.offerings ?? 0) + 1
  }

  for (const item of recordArray(data.tenantPages)) {
    const id = cleanString(item.id, 80) || idWith('page')
    const pagePath = cleanString(item.path, 300)
    const title = cleanString(item.title, 200)
    if (!pagePath || !title || !pagePath.startsWith('/')) throw new Error('Each tenant page needs a rooted path and title.')
    statements.push({
      query: `
      INSERT INTO tenant_pages
        (id, organization_id, site_id, path, title, slug, page_type, summary, body, components_json,
         cta_label, cta_url, seo_title, seo_description, canonical_url, robots, status, sort_order,
         source, source_ref, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(organization_id, site_id, path) DO UPDATE SET
        title = excluded.title, slug = excluded.slug, page_type = excluded.page_type,
        summary = excluded.summary, body = excluded.body, components_json = excluded.components_json,
        cta_label = excluded.cta_label, cta_url = excluded.cta_url, seo_title = excluded.seo_title,
        seo_description = excluded.seo_description, canonical_url = excluded.canonical_url,
        robots = excluded.robots, status = excluded.status, sort_order = excluded.sort_order,
        source = excluded.source, source_ref = excluded.source_ref, updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `,
      params: [
        id,
        organizationId,
        siteId,
        pagePath,
        title,
        cleanString(item.slug, 180) || pagePath.replace(/^\/+/, '').replace(/\//g, '-'),
        cleanString(item.page_type, 80) || 'standard',
        cleanString(item.summary, 700) || null,
        typeof item.body === 'string' ? item.body : null,
        json(Array.isArray(item.components) ? item.components : []),
        cleanString(item.cta_label, 120) || null,
        cleanString(item.cta_url, 500) || null,
        cleanString(item.seo_title, 200) || null,
        cleanString(item.seo_description, 500) || null,
        cleanString(item.canonical_url, 500) || null,
        cleanString(item.robots, 120) || null,
        cleanString(item.status, 30) || 'published',
        Number(item.sort_order ?? 0),
        cleanString(item.source, 80) || 'manual',
        cleanString(item.source_ref, 300) || null,
        updatedBy,
      ],
    })
    written.tenantPages = (written.tenantPages ?? 0) + 1
  }

  if (typeof data.compliance === 'object' && data.compliance) {
    const item = data.compliance as ApiRecord
    statements.push({
      query: `
      INSERT INTO tenant_compliance
        (id, organization_id, site_id, entity_name, dba_name, entity_type, nonprofit_status,
         registration_number, service_area, disclaimer, footer_disclaimer, document_asset_ids,
         metadata_json, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(site_id) DO UPDATE SET
        entity_name = excluded.entity_name, dba_name = excluded.dba_name, entity_type = excluded.entity_type,
        nonprofit_status = excluded.nonprofit_status, registration_number = excluded.registration_number,
        service_area = excluded.service_area, disclaimer = excluded.disclaimer,
        footer_disclaimer = excluded.footer_disclaimer, document_asset_ids = excluded.document_asset_ids,
        metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `,
      params: [
        cleanString(item.id, 80) || `compliance_${siteId}`,
        organizationId,
        siteId,
        cleanString(item.entity_name, 200) || null,
        cleanString(item.dba_name, 200) || null,
        cleanString(item.entity_type, 120) || null,
        cleanString(item.nonprofit_status, 120) || null,
        cleanString(item.registration_number, 120) || null,
        cleanString(item.service_area, 300) || null,
        typeof item.disclaimer === 'string' ? item.disclaimer : null,
        typeof item.footer_disclaimer === 'string' ? item.footer_disclaimer : null,
        json(Array.isArray(item.document_asset_ids) ? item.document_asset_ids : []),
        json(typeof item.metadata === 'object' ? item.metadata : {}),
        updatedBy,
      ],
    })
    written.compliance = 1
  }

  if (typeof data.consultation === 'object' && data.consultation) {
    const item = data.consultation as ApiRecord
    statements.push({
      query: `
      INSERT INTO site_consultation_settings
        (id, organization_id, site_id, mode, cta_label, external_url, schedule_path,
         confirmation_path, tracking_enabled, metadata_json, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(site_id) DO UPDATE SET
        mode = excluded.mode, cta_label = excluded.cta_label, external_url = excluded.external_url,
        schedule_path = excluded.schedule_path, confirmation_path = excluded.confirmation_path,
        tracking_enabled = excluded.tracking_enabled, metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `,
      params: [
        cleanString(item.id, 80) || `consultation_${siteId}`,
        organizationId,
        siteId,
        item.mode === 'native_disabled' ? 'native_disabled' : 'external_url',
        cleanString(item.cta_label, 120) || 'Book a consultation',
        cleanString(item.external_url, 500) || null,
        cleanString(item.schedule_path, 300) || '/schedule',
        cleanString(item.confirmation_path, 300) || '/contact/confirmed',
        item.tracking_enabled === false ? 0 : 1,
        json(typeof item.metadata === 'object' ? item.metadata : {}),
        updatedBy,
      ],
    })
    written.consultation = 1
  }

  if (typeof data.themeTokens === 'object' && data.themeTokens) {
    statements.push({
      query: `
      INSERT INTO site_theme_tokens
        (id, organization_id, site_id, template_slug, tokens_json, status, updated_at, updated_by)
      VALUES (?, ?, ?, 'blawby', ?, 'active', CURRENT_TIMESTAMP, ?)
      ON CONFLICT(site_id, template_slug) DO UPDATE SET
        tokens_json = excluded.tokens_json, status = 'active', updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `,
      params: [`theme_${siteId}_blawby`, organizationId, siteId, json(data.themeTokens), updatedBy],
    })
    written.themeTokens = 1
  }

  for (const item of recordArray(data.navigation)) {
    const id = cleanString(item.id, 80) || idWith('nav')
    statements.push({
      query: `
      INSERT INTO tenant_navigation_items
        (id, organization_id, site_id, area, label, url, item_type, sort_order, status, metadata_json, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(id) DO UPDATE SET
        area = excluded.area, label = excluded.label, url = excluded.url, item_type = excluded.item_type,
        sort_order = excluded.sort_order, status = excluded.status, metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `,
      params: [
        id,
        organizationId,
        siteId,
        cleanString(item.area, 30) || 'header',
        cleanString(item.label, 120) || 'Link',
        cleanString(item.url, 500) || '/',
        cleanString(item.item_type, 40) || 'internal',
        Number(item.sort_order ?? 0),
        cleanString(item.status, 30) || 'active',
        json(typeof item.metadata === 'object' ? item.metadata : {}),
        updatedBy,
      ],
    })
    written.navigation = (written.navigation ?? 0) + 1
  }

  if (statements.length) {
    await executeBatch(db, statements)
  }

  return { success: true, written }
}
