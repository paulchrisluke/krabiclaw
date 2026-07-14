import { executeBatch, queryAll, type BatchQuery, type DbClient } from '~/server/db'
import { cleanString } from '~/server/utils/api-response'
import { getPublicBlawbyData } from '~/server/utils/professional-services'
import { sanitizeUrl } from '~/utils/sanitize'
import { normalizeNonprofitStatus } from '~/utils/professional-service-schema'

export class ProfessionalServiceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfessionalServiceValidationError'
  }
}

function json(value: unknown) {
  return JSON.stringify(value ?? null)
}

function idWith(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

function validationError(message: string): never {
  throw new ProfessionalServiceValidationError(message)
}

function safeStoredUrl(value: unknown, maxLength: number) {
  return sanitizeUrl(cleanString(value, maxLength)) || null
}

// Unlike safeStoredUrl (which allows absolute http/https/mailto/tel URLs for
// external links like cta_url), these columns are constrained by a DB CHECK
// to site-relative paths (e.g. `schedule_path LIKE '/%'`) — accepting an
// absolute URL here would pass sanitizeUrl but then fail the CHECK with a
// raw D1 error instead of a clean validation message.
function safeStoredPath(value: unknown, maxLength: number) {
  const cleaned = cleanString(value, maxLength)
  return cleaned && cleaned.startsWith('/') && !cleaned.startsWith('//') ? cleaned : null
}

function recordArray(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.filter((item): item is ApiRecord => typeof item === 'object' && item !== null) : []
}

function sanitizedUrlArray(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const cleaned = typeof item === 'string' ? cleanString(item, maxLength) : ''
    try {
      const parsed = new URL(cleaned)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol')
      return parsed.toString()
    } catch {
      validationError(`compliance.same_as[${index}] must be an absolute HTTP(S) profile URL.`)
    }
  })
}

function sanitizedContactPoints(value: unknown): ApiRecord[] {
  return recordArray(value).map(point => ({
    contact_type: cleanString(point.contact_type, 80) || null,
    telephone: cleanString(point.telephone, 40) || null,
    email: cleanString(point.email, 200) || null,
    area_served: cleanString(point.area_served, 200) || null,
    available_language: Array.isArray(point.available_language)
      ? (point.available_language as unknown[]).map(item => cleanString(item, 40)).filter(Boolean)
      : (cleanString(point.available_language, 40) || null),
    url: safeStoredUrl(point.url, 500),
  })).filter(point => point.telephone || point.email || point.url)
}

const BLAWBY_THEME_COLOR_KEYS = new Set([
  'bg',
  'surface',
  'primary',
  'primaryDark',
  'primary100',
  'primary200',
  'primary800',
  'accent',
  'accent100',
  'accent200',
  'accentButton',
  'accentStrong',
  'border',
  'ink',
])

function looksLikeExecutableCalculatorSyntax(value: string) {
  // Deliberately narrow: this runs against every string in a calculator
  // component, including free-text disclaimers/footnotes/citations that
  // routinely contain semicolons, braces, or the word "return" (e.g. legal
  // prose like "Rates set by the board; effective July 2026"). A blanket
  // `[{};]|\breturn\b` match rejects that legitimate content, so only match
  // actual code shapes (arrow functions, function/eval/Function calls,
  // javascript: URIs, or a bare `identifier(...)` call expression).
  return (
    /=>|\bfunction\s*\(|\bnew Function\b|\beval\s*\(|\bjavascript:/i.test(value) ||
    /^\s*[A-Za-z_$][\w$]*\s*\([^)]*\)\s*$/.test(value)
  )
}

function assertNoArbitraryCalculatorLogic(value: unknown, path = 'calculator') {
  if (value == null) return
  if (typeof value === 'string') {
    if (looksLikeExecutableCalculatorSyntax(value)) {
      validationError(`${path} contains arbitrary calculator logic. Use structured ranges, fees, and source metadata.`)
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
      validationError(`${path}.${key} is not allowed. Calculator components must be structured data, not executable logic.`)
    }
    assertNoArbitraryCalculatorLogic(nested, `${path}.${key}`)
  }
}

function validateThemeTokens(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    validationError('themeTokens must be an object.')
  }

  const input = value as ApiRecord
  const output: ApiRecord = {}

  for (const [key, rawValue] of Object.entries(input)) {
    if (!BLAWBY_THEME_COLOR_KEYS.has(key)) {
      validationError(`themeTokens.${key} is not supported.`)
    }

    if (Array.isArray(rawValue) || typeof rawValue === 'object' || rawValue == null) {
      validationError(`themeTokens.${key} must be a hex color string.`)
    }

    const token = cleanString(rawValue, 40)
    if (!token || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(token)) {
      validationError(`themeTokens.${key} must be a valid hex color.`)
    }
    output[key] = token
  }

  return output
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
        validationError('pricing_calculator needs source or effective date metadata.')
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
  const navigationItems = recordArray(data.navigation)
  const providedNavigationIds = Array.from(new Set(
    navigationItems
      .map(item => cleanString(item.id, 80))
      .filter(Boolean),
  ))

  if (providedNavigationIds.length) {
    const foreignNavigation = await queryAll<{ id: string }>(db, `
      SELECT id
        FROM tenant_navigation_items
       WHERE id IN (${providedNavigationIds.map(() => '?').join(',')})
         AND (organization_id <> ? OR site_id <> ?)
    `, [...providedNavigationIds, organizationId, siteId])
    if (foreignNavigation.length) {
      validationError('Navigation item ids must belong to the current site.')
    }
  }

  for (const item of recordArray(data.offerings)) {
    const id = cleanString(item.id, 80) || idWith('offering')
    const name = cleanString(item.name, 200)
    const slug = cleanString(item.slug, 180)
    if (!name || !slug) validationError('Each offering needs name and slug.')
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
        safeStoredUrl(item.cta_url, 500),
        cleanString(item.thumbnail_asset_id, 120) || null,
        cleanString(item.hero_image_asset_id, 120) || null,
        json(Array.isArray(item.media_asset_ids) ? item.media_asset_ids : []),
        cleanString(item.schema_type, 120) || 'Service',
        cleanString(item.seo_title, 200) || null,
        cleanString(item.seo_description, 500) || null,
        safeStoredPath(item.canonical_path, 300) || `/services/${slug}`,
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
    if (!pagePath || !title || !pagePath.startsWith('/')) validationError('Each tenant page needs a rooted path and title.')
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
        safeStoredUrl(item.cta_url, 500),
        cleanString(item.seo_title, 200) || null,
        cleanString(item.seo_description, 500) || null,
        safeStoredUrl(item.canonical_url, 500),
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
    // Canonical contract: nonprofit_status must be a recognized schema.org
    // nonprofit enumeration value (e.g. https://schema.org/Nonprofit501c3),
    // not free text like "501(c)(3)". Reject rather than silently store an
    // invalid value — see utils/professional-service-schema.ts.
    const nonprofitStatus = normalizeNonprofitStatus(cleanString(item.nonprofit_status, 120))
    if (!nonprofitStatus.valid) {
      validationError(
        `compliance.nonprofit_status "${item.nonprofit_status}" is not a recognized schema.org nonprofit enumeration value (expected a form like "501(c)(3)" or "https://schema.org/Nonprofit501c3").`,
      )
    }
    const entityType = cleanString(item.entity_type, 120)
    if (entityType && !/^[A-Z][A-Za-z0-9]*$/.test(entityType)) {
      validationError('compliance.entity_type must be a schema.org type name such as LegalService or AccountingService.')
    }
    const serviceAreaType = cleanString(item.service_area_type, 60)
    if (serviceAreaType && !new Set(['AdministrativeArea', 'City', 'Country', 'Place', 'State']).has(serviceAreaType)) {
      validationError('compliance.service_area_type must be AdministrativeArea, City, Country, Place, or State.')
    }
    const foundingDate = cleanString(item.founding_date, 40)
    if (foundingDate && !/^\d{4}-\d{2}-\d{2}$/.test(foundingDate)) {
      validationError('compliance.founding_date must use YYYY-MM-DD format.')
    }
    if (item.address_visibility != null && !['visible', 'hidden'].includes(String(item.address_visibility))) {
      validationError('compliance.address_visibility must be visible or hidden.')
    }
    const addressVisibility = item.address_visibility === 'visible' ? 'visible' : 'hidden'
    statements.push({
      query: `
      INSERT INTO tenant_compliance
        (id, organization_id, site_id, entity_name, dba_name, entity_type, nonprofit_status,
         registration_number, service_area, service_area_type, disclaimer, footer_disclaimer, document_asset_ids,
         founder_name, founding_date, same_as, contact_points, address_visibility,
         metadata_json, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(site_id) DO UPDATE SET
        entity_name = excluded.entity_name, dba_name = excluded.dba_name, entity_type = excluded.entity_type,
        nonprofit_status = excluded.nonprofit_status, registration_number = excluded.registration_number,
        service_area = excluded.service_area, service_area_type = excluded.service_area_type,
        disclaimer = excluded.disclaimer, footer_disclaimer = excluded.footer_disclaimer,
        document_asset_ids = excluded.document_asset_ids, founder_name = excluded.founder_name,
        founding_date = excluded.founding_date, same_as = excluded.same_as,
        contact_points = excluded.contact_points, address_visibility = excluded.address_visibility,
        metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `,
      params: [
        cleanString(item.id, 80) || `compliance_${siteId}`,
        organizationId,
        siteId,
        cleanString(item.entity_name, 200) || null,
        cleanString(item.dba_name, 200) || null,
        entityType || null,
        nonprofitStatus.value,
        cleanString(item.registration_number, 120) || null,
        cleanString(item.service_area, 300) || null,
        serviceAreaType || null,
        typeof item.disclaimer === 'string' ? item.disclaimer : null,
        typeof item.footer_disclaimer === 'string' ? item.footer_disclaimer : null,
        json(Array.isArray(item.document_asset_ids) ? item.document_asset_ids : []),
        cleanString(item.founder_name, 200) || null,
        foundingDate || null,
        json(sanitizedUrlArray(item.same_as, 500)),
        json(sanitizedContactPoints(item.contact_points)),
        addressVisibility,
        json(typeof item.metadata === 'object' ? item.metadata : {}),
        updatedBy,
      ],
    })
    written.compliance = 1
  }

  if (typeof data.consultation === 'object' && data.consultation) {
    const item = data.consultation as ApiRecord
    const mode = item.mode === 'native_disabled' ? 'native_disabled' : 'external_url'
    const externalUrl = mode === 'native_disabled' ? null : safeStoredUrl(item.external_url, 500)
    if (mode === 'external_url' && !externalUrl) {
      validationError('consultation.external_url is required when mode is external_url.')
    }
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
        mode,
        cleanString(item.cta_label, 120) || 'Book a consultation',
        externalUrl,
        safeStoredPath(item.schedule_path, 300) || '/schedule',
        safeStoredPath(item.confirmation_path, 300) || '/contact/confirmed',
        item.tracking_enabled === false ? 0 : 1,
        json(typeof item.metadata === 'object' ? item.metadata : {}),
        updatedBy,
      ],
    })
    written.consultation = 1
  }

  if (typeof data.themeTokens === 'object' && data.themeTokens) {
    const themeTokens = validateThemeTokens(data.themeTokens)
    statements.push({
      query: `
      INSERT INTO site_theme_tokens
        (id, organization_id, site_id, template_slug, tokens_json, status, updated_at, updated_by)
      VALUES (?, ?, ?, 'blawby', ?, 'active', CURRENT_TIMESTAMP, ?)
      ON CONFLICT(site_id, template_slug) DO UPDATE SET
        tokens_json = excluded.tokens_json, status = 'active', updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `,
      params: [`theme_${siteId}_blawby`, organizationId, siteId, json(themeTokens), updatedBy],
    })
    written.themeTokens = 1
  }

  for (const item of navigationItems) {
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
        safeStoredUrl(item.url, 500) || '/',
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
