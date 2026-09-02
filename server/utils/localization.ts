import { HTTPError } from 'nitro'
import englishManifest from '~/i18n/locales/en.json' with { type: 'json' }
import {
  flattenLocaleManifest,
  localeManifestHash,
  validateLocaleCatalog,
} from '~/shared/platform-locale-catalog'
import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { getOrganizationBillingProjection } from '~/server/utils/organization-billing'
import {
  createContentDocumentWithBlocks,
  getContentDocumentById,
  getContentEditorSnapshotForDocument,
  replaceContentDocumentBlocks,
  type ContentBlockInput,
} from '~/server/utils/content-documents'
import { localizationError } from '~/server/utils/localization-errors'
import {
  RESOURCE_LOCALIZATION_REGISTRY,
  parseLocalizedResourceType,
  validateLocalizedRoutePath,
  validateLocalizedValues,
  type LocalizedResourceType,
  type LocalizedValues,
} from '~/server/utils/localization-registry'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

export type PlatformLocaleDirection = 'ltr' | 'rtl'
export type PlatformLocaleStatus = 'unavailable' | 'available'
export type SiteLanguageLicenseStatus = 'enabling' | 'active' | 'disabling' | 'disabled'

export interface SiteLocaleRecord {
  id: string
  organization_id: string
  site_id: string
  locale: string
  label: string | null
  is_source: boolean
  status: 'published' | 'disabled'
  created_at: string
  updated_at: string
}

export interface ResourceLocalizationRecord {
  id: string
  organization_id: string
  site_id: string
  resource_type: LocalizedResourceType
  resource_id: string
  locale: string
  values: LocalizedValues
  route_path: string | null
  document_id: string | null
  created_at: number
  created_by_user_id: string
  updated_at: number
  updated_by_user_id: string
}

export interface ResourceLocalizationAuthoringRecord extends ResourceLocalizationRecord {
  content_document?: Awaited<ReturnType<typeof getContentEditorSnapshotForDocument>>
}

export interface LocalizedPublicRoute {
  locale: string
  route_path: string
  platform_messages: Record<string, string>
  locale_representations: PublicLocaleRepresentation[]
  site: ResourceLocalizationRecord
  representation:
    | { kind: 'tenant_page'; resource_type: 'tenant_page'; resource_id: string }
    | { kind: 'resource'; resource_type: LocalizedResourceType; resource_id: string; localization: ResourceLocalizationRecord }
}

interface SiteLocaleRow extends Omit<SiteLocaleRecord, 'is_source'> {
  is_source: number | boolean
}

interface ResourceLocalizationRow extends Omit<ResourceLocalizationRecord, 'values'> {
  values_json: string
}

interface EntitlementRow {
  locale_status: string | null
  license_status: SiteLanguageLicenseStatus | null
  catalog_status: PlatformLocaleStatus | null
  source_manifest_hash: string | null
}

export function canonicalizeLocale(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    localizationError(400, 'LOCALE_NOT_CANONICAL', 'Locale must be a canonical BCP 47 language tag')
  }
  try {
    const canonical = Intl.getCanonicalLocales(value.trim())
    if (canonical.length !== 1 || !canonical[0]) throw new RangeError('Expected one locale')
    return canonical[0]
  } catch {
    localizationError(400, 'LOCALE_NOT_CANONICAL', 'Locale must be a canonical BCP 47 language tag', { locale: value })
  }
}

export function assertExactCanonicalLocale(value: unknown): string {
  const canonical = canonicalizeLocale(value)
  if (value !== canonical) {
    localizationError(404, 'LOCALE_NOT_CANONICAL', 'Locale path must use the exact canonical language tag', {
      locale: value,
      canonical_locale: canonical,
    })
  }
  return canonical
}

export async function getPersistedSourceLocale(
  db: DbClient,
  organizationId: string,
  siteId: string,
): Promise<SiteLocaleRecord> {
  const rows = await queryAll<SiteLocaleRow>(db, `
    SELECT id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at
      FROM site_locales
     WHERE organization_id = ? AND site_id = ? AND is_source = 1
     ORDER BY id
  `, [organizationId, siteId])
  if (rows.length !== 1 || rows[0]?.locale !== 'en' || rows[0].status !== 'published') {
    throw new HTTPError({
      statusCode: 500,
      statusMessage: 'Site source locale integrity check failed',
      data: { code: 'SITE_SOURCE_LOCALE_INTEGRITY', site_id: siteId },
    })
  }
  return { ...rows[0], is_source: Boolean(rows[0].is_source) }
}

export async function listSiteLocaleRecords(
  db: DbClient,
  organizationId: string,
  siteId: string,
): Promise<SiteLocaleRecord[]> {
  await getPersistedSourceLocale(db, organizationId, siteId)
  const rows = await queryAll<SiteLocaleRow>(db, `
    SELECT id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at
      FROM site_locales
     WHERE organization_id = ? AND site_id = ?
     ORDER BY is_source DESC, locale ASC
  `, [organizationId, siteId])
  return rows.map(row => ({ ...row, is_source: Boolean(row.is_source) }))
}

export const ENGLISH_LOCALE_MESSAGES = Object.freeze(flattenLocaleManifest(englishManifest))

// ENGLISH_LOCALE_MESSAGES is a frozen module-level constant, so its hash
// never changes within an isolate - compute it once and reuse the Promise.
let cachedEnglishManifestHash: Promise<string> | null = null
export function englishManifestHash(): Promise<string> {
  if (!cachedEnglishManifestHash) {
    cachedEnglishManifestHash = (async () => {
      return await localeManifestHash(ENGLISH_LOCALE_MESSAGES)
    })()
  }
  return cachedEnglishManifestHash
}

function validateCatalogMessages(messages: unknown, complete: boolean): Record<string, string> {
  const validation = validateLocaleCatalog(ENGLISH_LOCALE_MESSAGES, messages, { complete })
  if (validation.ok) return validation.messages

  const issue = validation.issue
  switch (issue.kind) {
    case 'shape':
      return localizationError(422, 'PLATFORM_CATALOG_INCOMPLETE', 'Catalog messages must be an object')
    case 'coverage':
      return localizationError(422, 'PLATFORM_CATALOG_INCOMPLETE', 'Platform locale catalog does not match the English manifest', {
        missing: issue.missing,
        extra: issue.extra,
      })
    case 'value':
      return localizationError(422, 'PLATFORM_CATALOG_INCOMPLETE', `Catalog message ${issue.key} must be a string`, { message_key: issue.key })
    case 'placeholder':
      return localizationError(422, 'PLATFORM_CATALOG_PLACEHOLDER_MISMATCH', `Catalog message ${issue.key} has different placeholders`, {
        message_key: issue.key,
        expected: issue.expected,
        actual: issue.actual,
      })
  }
}

export async function listPlatformLocaleCatalogs(db: DbClient) {
  const currentHash = await englishManifestHash()
  const catalogs = await queryAll<Record<string, unknown>>(db, `
    SELECT c.locale, c.label, c.direction, c.status, c.source_manifest_hash,
           c.available_at, c.available_by_user_id, c.created_at, c.created_by_user_id,
           c.updated_at, c.updated_by_user_id,
           COUNT(DISTINCT m.message_key) AS completed_keys,
           COUNT(DISTINCT CASE WHEN l.status = 'active' THEN l.id END) AS active_license_count
      FROM platform_locale_catalogs c
      LEFT JOIN platform_locale_messages m ON m.locale = c.locale AND trim(m.message_value) <> ''
      LEFT JOIN site_language_licenses l ON l.locale = c.locale
     GROUP BY c.locale
     ORDER BY c.locale
  `)
  const totalKeys = Object.keys(ENGLISH_LOCALE_MESSAGES).length
  return catalogs.map(catalog => ({
    ...catalog,
    total_keys: totalKeys,
    completed_keys: Number(catalog.completed_keys ?? 0),
    missing_keys: totalKeys - Number(catalog.completed_keys ?? 0),
    manifest_current: catalog.source_manifest_hash === currentHash,
  }))
}

export async function getPlatformLocaleCatalog(db: DbClient, localeInput: unknown) {
  const locale = assertExactCanonicalLocale(localeInput)
  const catalog = await queryFirst<Record<string, unknown>>(db, `
    SELECT c.*,
           (SELECT COUNT(*) FROM site_language_licenses l WHERE l.locale = c.locale AND l.status = 'active') AS active_license_count
      FROM platform_locale_catalogs c
     WHERE c.locale = ?
     LIMIT 1
  `, [locale])
  if (!catalog) localizationError(404, 'PLATFORM_LOCALE_UNAVAILABLE', 'Platform locale catalog was not found', { locale })
  const rows = await queryAll<{ message_key: string; message_value: string }>(db, `
    SELECT message_key, message_value
      FROM platform_locale_messages
     WHERE locale = ?
     ORDER BY message_key
  `, [locale])
  return {
    ...catalog,
    source_messages: ENGLISH_LOCALE_MESSAGES,
    messages: Object.fromEntries(rows.map(row => [row.message_key, row.message_value])),
    current_source_manifest_hash: await englishManifestHash(),
  }
}

export async function registerPlatformLocaleCatalog(
  db: DbClient,
  input: { locale: unknown; label: unknown; direction: unknown },
  userId: string,
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === 'en') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English is the immutable source catalog')
  if (typeof input.label !== 'string' || !input.label.trim()) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'label is required')
  if (input.direction !== 'ltr' && input.direction !== 'rtl') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'direction must be ltr or rtl')
  const now = Math.floor(Date.now() / 1000)
  await execute(db, `
    INSERT INTO platform_locale_catalogs
      (locale, label, direction, status, created_at, created_by_user_id, updated_at, updated_by_user_id)
    VALUES (?, ?, ?, 'unavailable', ?, ?, ?, ?)
  `, [locale, input.label.trim(), input.direction, now, userId, now, userId])
  return await getPlatformLocaleCatalog(db, locale)
}

export async function replacePlatformLocaleMessages(
  db: DbClient,
  localeInput: unknown,
  messages: unknown,
  userId: string,
) {
  const locale = assertExactCanonicalLocale(localeInput)
  const catalog = await queryFirst<{ status: PlatformLocaleStatus }>(db, `SELECT status FROM platform_locale_catalogs WHERE locale = ? LIMIT 1`, [locale])
  if (!catalog) localizationError(404, 'PLATFORM_LOCALE_UNAVAILABLE', 'Platform locale catalog was not found', { locale })
  const normalized = validateCatalogMessages(messages, catalog.status === 'available')
  const now = Math.floor(Date.now() / 1000)
  const statements: BatchQuery[] = [{ query: 'DELETE FROM platform_locale_messages WHERE locale = ?', params: [locale] }]
  for (const [messageKey, messageValue] of Object.entries(normalized)) {
    statements.push({
      query: `INSERT INTO platform_locale_messages (locale, message_key, message_value, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?, ?)`,
      params: [locale, messageKey, messageValue, now, userId],
    })
  }
  statements.push({ query: 'UPDATE platform_locale_catalogs SET updated_at = ?, updated_by_user_id = ? WHERE locale = ?', params: [now, userId, locale] })
  await executeBatch(db, statements, { operation: 'replace platform locale catalog' })
  return await getPlatformLocaleCatalog(db, locale)
}

export async function publishPlatformLocaleCatalog(
  db: DbClient,
  localeInput: unknown,
  messages: unknown,
  userId: string,
) {
  const locale = assertExactCanonicalLocale(localeInput)
  const catalog = await queryFirst<{ locale: string }>(db, 'SELECT locale FROM platform_locale_catalogs WHERE locale = ? LIMIT 1', [locale])
  if (!catalog) localizationError(404, 'PLATFORM_LOCALE_UNAVAILABLE', 'Platform locale catalog was not found', { locale })
  const normalized = validateCatalogMessages(messages, true)
  const hash = await englishManifestHash()
  const now = Math.floor(Date.now() / 1000)
  const statements: BatchQuery[] = [{ query: 'DELETE FROM platform_locale_messages WHERE locale = ?', params: [locale] }]
  for (const [messageKey, messageValue] of Object.entries(normalized)) {
    statements.push({
      query: 'INSERT INTO platform_locale_messages (locale, message_key, message_value, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?, ?)',
      params: [locale, messageKey, messageValue, now, userId],
    })
  }
  statements.push({
    query: `UPDATE platform_locale_catalogs
               SET status = 'available', source_manifest_hash = ?, available_at = ?, available_by_user_id = ?, updated_at = ?, updated_by_user_id = ?
             WHERE locale = ?`,
    params: [hash, now, userId, now, userId, locale],
  })
  await executeBatch(db, statements, { operation: 'publish platform locale catalog' })
  return await getPlatformLocaleCatalog(db, locale)
}

async function assertCatalogHasNoActiveLicenses(db: DbClient, locale: string): Promise<void> {
  const active = await queryFirst<{ count: number }>(db, `SELECT COUNT(*) AS count FROM site_language_licenses WHERE locale = ? AND status = 'active'`, [locale])
  if (Number(active?.count ?? 0) > 0) {
    localizationError(409, 'PLATFORM_LOCALE_UNAVAILABLE', 'A catalog with active language licenses cannot be made unavailable or deleted', { locale })
  }
}

export async function makePlatformLocaleUnavailable(db: DbClient, localeInput: unknown, userId: string) {
  const locale = assertExactCanonicalLocale(localeInput)
  await assertCatalogHasNoActiveLicenses(db, locale)
  await execute(db, `UPDATE platform_locale_catalogs SET status = 'unavailable', available_at = NULL, available_by_user_id = NULL, updated_at = ?, updated_by_user_id = ? WHERE locale = ?`, [Math.floor(Date.now() / 1000), userId, locale])
  return await getPlatformLocaleCatalog(db, locale)
}

export async function deletePlatformLocaleCatalog(db: DbClient, localeInput: unknown): Promise<{ deleted: true; locale: string }> {
  const locale = assertExactCanonicalLocale(localeInput)
  await assertCatalogHasNoActiveLicenses(db, locale)
  await execute(db, 'DELETE FROM platform_locale_catalogs WHERE locale = ?', [locale])
  return { deleted: true, locale }
}

// Manual localization is included free with Growth (up to one secondary
// language) rather than a paid $5/mo add-on - Growth plan is still required
// to enable a language, but enabling one never charges through Stripe.
// Flip back to true to re-enable the per-language Stripe charge.
export const LANGUAGE_LICENSE_CHARGES_ENABLED = false

function billingUrl(organizationSlug: string | null, siteSlug: string | null): string | null {
  if (!organizationSlug || !siteSlug) return null
  return `/dashboard/${encodeURIComponent(organizationSlug)}/sites/${encodeURIComponent(siteSlug)}/settings/localization`
}

export async function assertSiteLanguageEntitlement(
  db: DbClient,
  organizationId: string,
  siteId: string,
  localeInput: unknown,
): Promise<{ locale: string; source: boolean; platform_messages: Record<string, string> | null }> {
  const locale = assertExactCanonicalLocale(localeInput)
  const source = await getPersistedSourceLocale(db, organizationId, siteId)
  if (locale === source.locale) return { locale, source: true, platform_messages: null }
  const row = await queryFirst<EntitlementRow & { organization_slug: string | null; site_slug: string | null }>(db, `
    SELECT sl.status AS locale_status, l.status AS license_status,
           c.status AS catalog_status, c.source_manifest_hash,
           o.slug AS organization_slug, s.slug AS site_slug
      FROM sites s
      JOIN organization o ON o.id = s.organization_id
      LEFT JOIN site_locales sl ON sl.organization_id = s.organization_id AND sl.site_id = s.id AND sl.locale = ?
      LEFT JOIN site_language_licenses l ON l.organization_id = s.organization_id AND l.site_id = s.id AND l.locale = ?
      LEFT JOIN platform_locale_catalogs c ON c.locale = ?
     WHERE s.organization_id = ? AND s.id = ?
     LIMIT 1
  `, [locale, locale, locale, organizationId, siteId])
  if (!row) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Site was not found', { site_id: siteId })
  if (row.license_status === 'enabling' || row.license_status === 'disabling') {
    localizationError(409, 'LANGUAGE_LICENSE_SYNCING', 'Language license synchronization is still in progress', { site_id: siteId, locale })
  }
  const plan = (await getOrganizationBillingProjection(db, organizationId)).effectivePlan
  const manifestCurrent = row.source_manifest_hash === await englishManifestHash()
  if (row.catalog_status !== 'available' || !manifestCurrent) {
    localizationError(403, 'PLATFORM_LOCALE_UNAVAILABLE', 'The platform locale catalog is unavailable', { locale })
  }
  if (plan !== 'growth' || row.license_status !== 'active' || row.locale_status !== 'published') {
    localizationError(402, 'LANGUAGE_LICENSE_REQUIRED', 'An active Growth language license is required', {
      site_id: siteId,
      locale,
      billing_url: billingUrl(row.organization_slug, row.site_slug),
    })
  }
  const messages = await queryAll<{ message_key: string; message_value: string }>(db, `SELECT message_key, message_value FROM platform_locale_messages WHERE locale = ? ORDER BY message_key`, [locale])
  return { locale, source: false, platform_messages: Object.fromEntries(messages.map(message => [message.message_key, message.message_value])) }
}

function mapLocalization(row: ResourceLocalizationRow): ResourceLocalizationRecord {
  const parsed = JSON.parse(row.values_json) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Stored resource localization is invalid', data: { code: 'INVALID_STORED_CONTENT' } })
  }
  const { values_json: _valuesJson, ...rest } = row
  return { ...rest, values: parsed as LocalizedValues }
}

async function getSiteVertical(db: DbClient, organizationId: string, siteId: string): Promise<string> {
  const site = await queryFirst<{ vertical: string }>(db, 'SELECT vertical FROM sites WHERE organization_id = ? AND id = ? LIMIT 1', [organizationId, siteId])
  if (!site) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Site was not found', { site_id: siteId })
  return site.vertical
}

async function assertCanonicalResourceExists(
  db: DbClient,
  organizationId: string,
  siteId: string,
  resourceType: LocalizedResourceType,
  resourceId: string,
): Promise<void> {
  const table = RESOURCE_LOCALIZATION_REGISTRY[resourceType].table
  const row = resourceType === 'site'
    ? await queryFirst<{ id: string }>(db, `SELECT id FROM ${table} WHERE organization_id = ? AND id = ? LIMIT 1`, [organizationId, resourceId])
    : await queryFirst<{ id: string }>(db, `SELECT id FROM ${table} WHERE organization_id = ? AND site_id = ? AND id = ? LIMIT 1`, [organizationId, siteId, resourceId])
  if (!row || (resourceType === 'site' && resourceId !== siteId)) {
    localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Canonical resource was not found', { resource_type: resourceType, resource_id: resourceId })
  }
}

export async function getResourceLocalization(
  db: DbClient,
  organizationId: string,
  siteId: string,
  resourceTypeInput: unknown,
  resourceId: string,
  localeInput: unknown,
): Promise<ResourceLocalizationRecord> {
  const resourceType = parseLocalizedResourceType(resourceTypeInput)
  const { locale, source } = await assertSiteLanguageEntitlement(db, organizationId, siteId, localeInput)
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content is not stored as a resource localization')
  const row = await queryFirst<ResourceLocalizationRow>(db, `
    SELECT id, organization_id, site_id, resource_type, resource_id, locale, values_json, route_path,
           document_id, created_at, created_by_user_id, updated_at, updated_by_user_id
      FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND resource_type = ? AND resource_id = ? AND locale = ?
     LIMIT 1
  `, [organizationId, siteId, resourceType, resourceId, locale])
  if (!row) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Exact localized representation was not found', { resource_type: resourceType, resource_id: resourceId, locale })
  return mapLocalization(row)
}

export async function getResourceLocalizationForAuthoring(
  db: DbClient,
  organizationId: string,
  siteId: string,
  resourceTypeInput: unknown,
  resourceId: string,
  localeInput: unknown,
): Promise<ResourceLocalizationAuthoringRecord> {
  const localization = await getResourceLocalization(
    db,
    organizationId,
    siteId,
    resourceTypeInput,
    resourceId,
    localeInput,
  )
  if (localization.resource_type !== 'tenant_blog_post' || !localization.document_id) return localization
  const document = await getContentDocumentById(db, localization.document_id)
  if (!document) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Localized blog content document is missing' })
  }
  return { ...localization, content_document: await getContentEditorSnapshotForDocument(db, document) }
}

export async function resolveLocalizedPublicRoute(
  db: DbClient,
  organizationId: string,
  siteId: string,
  routePathInput: unknown,
): Promise<LocalizedPublicRoute> {
  if (typeof routePathInput !== 'string' || !routePathInput.startsWith('/') || routePathInput.includes('?') || routePathInput.includes('#')) {
    localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Localized route was not found')
  }
  const routePath = routePathInput.length > 1 ? routePathInput.replace(/\/+$/, '') : routePathInput
  const firstSegment = routePath.split('/')[1]
  const locale = assertExactCanonicalLocale(firstSegment)
  const entitlement = await assertSiteLanguageEntitlement(db, organizationId, siteId, locale)
  if (entitlement.source) {
    localizationError(404, 'LOCALIZATION_NOT_FOUND', 'English source routes are unprefixed', { locale, route_path: routePath })
  }
  // Reuse the entitlement already checked above instead of re-deriving it
  // via getResourceLocalization - this runs on every localized page request.
  const siteRow = await queryFirst<ResourceLocalizationRow>(db, `
    SELECT id, organization_id, site_id, resource_type, resource_id, locale, values_json, route_path,
           document_id, created_at, created_by_user_id, updated_at, updated_by_user_id
      FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND resource_type = 'site' AND resource_id = ? AND locale = ?
     LIMIT 1
  `, [organizationId, siteId, siteId, locale])
  if (!siteRow) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Exact localized representation was not found', { resource_type: 'site', resource_id: siteId, locale })
  const site = mapLocalization(siteRow)
  const sourceLocale = await queryFirst<{ label: string | null }>(db, `
    SELECT label FROM site_locales
     WHERE organization_id = ? AND site_id = ? AND is_source = 1
     LIMIT 1
  `, [organizationId, siteId])
  const sourceLabel = sourceLocale?.label ?? 'English'
  const { listPublicLocaleRepresentations, listPublicResourceLocaleRepresentations } = await import('~/server/utils/public-locale-representations')
  const resource = await queryFirst<ResourceLocalizationRow>(db, `
    SELECT id, organization_id, site_id, resource_type, resource_id, locale, values_json, route_path,
           document_id, created_at, created_by_user_id, updated_at, updated_by_user_id
      FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND locale = ? AND route_path = ?
     LIMIT 1
  `, [organizationId, siteId, locale, routePath])
  if (resource) {
    const localization = mapLocalization(resource)
    await assertCanonicalResourceExists(db, organizationId, siteId, localization.resource_type, localization.resource_id)
    return {
      locale,
      route_path: routePath,
      platform_messages: entitlement.platform_messages ?? {},
      locale_representations: await listPublicResourceLocaleRepresentations(db, {
        organizationId,
        siteId,
        sourceLabel,
        resource: { type: localization.resource_type, id: localization.resource_id },
      }),
      site,
      representation: {
        kind: 'resource',
        resource_type: localization.resource_type,
        resource_id: localization.resource_id,
        localization,
      },
    }
  }
  // tenant_page_variants.path is stored locale-bare (the CMS writes the same
  // '/', '/about', etc. for every locale) - unlike resource_localizations,
  // whose route_path column stores the full '/locale/...' path. Strip the
  // locale segment back off before matching.
  const tenantPagePath = routePath.slice(locale.length + 1) || '/'
  const page = await queryFirst<{ id: string; page_id: string }>(db, `
    SELECT v.id, v.page_id
      FROM tenant_page_variants v
      JOIN content_documents d ON d.owner_type = 'tenant_page' AND d.owner_id = v.id
     WHERE v.organization_id = ? AND v.site_id = ? AND v.locale = ? AND v.path = ?
     LIMIT 1
  `, [organizationId, siteId, locale, tenantPagePath])
  if (!page) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Exact localized route was not found', { locale, route_path: routePath })
  return {
    locale,
    route_path: routePath,
    platform_messages: entitlement.platform_messages ?? {},
    locale_representations: await listPublicLocaleRepresentations(db, {
      organizationId,
      siteId,
      sourcePath: tenantPagePath,
      sourceLabel,
      pageId: page.page_id,
    }),
    site,
    representation: { kind: 'tenant_page', resource_type: 'tenant_page', resource_id: page.page_id },
  }
}

export async function resolveLocalizedRedirect(
  db: DbClient,
  organizationId: string,
  siteId: string,
  routePathInput: unknown,
) {
  if (typeof routePathInput !== 'string' || !routePathInput.startsWith('/')) return null
  const routePath = routePathInput.length > 1 ? routePathInput.replace(/\/+$/, '') : routePathInput
  const locale = assertExactCanonicalLocale(routePath.split('/')[1])
  await assertSiteLanguageEntitlement(db, organizationId, siteId, locale)
  return await queryFirst<{ behavior: 'redirect' | 'gone' | 'noindex'; status_code: number; to_path: string | null }>(db, `
    SELECT behavior, status_code, to_path
      FROM site_redirects
     WHERE organization_id = ? AND site_id = ? AND locale = ? AND from_path = ?
     LIMIT 1
  `, [organizationId, siteId, locale, routePath])
}

export async function putResourceLocalization(
  db: DbClient,
  input: {
    organizationId: string
    siteId: string
    resourceType: unknown
    resourceId: string
    locale: unknown
    values: unknown
    routePath?: unknown
    userId: string
  },
): Promise<ResourceLocalizationRecord> {
  const resourceType = parseLocalizedResourceType(input.resourceType)
  const { locale, source } = await assertSiteLanguageEntitlement(db, input.organizationId, input.siteId, input.locale)
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content must be edited through its canonical resource')
  await assertCanonicalResourceExists(db, input.organizationId, input.siteId, resourceType, input.resourceId)
  const values = validateLocalizedValues(resourceType, input.values)
  const vertical = await getSiteVertical(db, input.organizationId, input.siteId)
  const routePath = validateLocalizedRoutePath(resourceType, locale, input.routePath, vertical)
  const existing = await queryFirst<{ id: string; route_path: string | null; created_at: number; created_by_user_id: string }>(db, `
    SELECT id, route_path, created_at, created_by_user_id
      FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND resource_type = ? AND resource_id = ? AND locale = ?
     LIMIT 1
  `, [input.organizationId, input.siteId, resourceType, input.resourceId, locale])
  const id = existing?.id ?? crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const statements: BatchQuery[] = []
  if (existing?.route_path && existing.route_path !== routePath && routePath) {
    statements.push({
      query: `INSERT INTO site_redirects
        (id, organization_id, site_id, locale, owner_type, owner_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'resource_localization', ?, ?, ?, 301, 'redirect', 'localized_route_change', 'localization', ?, ?)
        ON CONFLICT(site_id, locale, from_path) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id,
          to_path = excluded.to_path, status_code = 301, behavior = 'redirect', reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at`,
      params: [crypto.randomUUID(), input.organizationId, input.siteId, locale, id, existing.route_path, routePath, new Date().toISOString(), new Date().toISOString()],
    })
  }
  statements.push({
    query: `INSERT INTO resource_localizations
      (id, organization_id, site_id, resource_type, resource_id, locale, values_json, route_path,
       created_at, created_by_user_id, updated_at, updated_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, site_id, resource_type, resource_id, locale) DO UPDATE SET
        values_json = excluded.values_json, route_path = excluded.route_path,
        updated_at = excluded.updated_at, updated_by_user_id = excluded.updated_by_user_id`,
    params: [id, input.organizationId, input.siteId, resourceType, input.resourceId, locale, JSON.stringify(values), routePath,
      existing?.created_at ?? now, existing?.created_by_user_id ?? input.userId, now, input.userId],
  })
  try {
    await executeBatch(db, statements, { operation: 'replace resource localization' })
  } catch (error) {
    if (error instanceof Error && /resource_localizations_site_locale_route_unique|UNIQUE constraint failed: resource_localizations\.site_id/.test(error.message)) {
      localizationError(409, 'LOCALIZED_ROUTE_CONFLICT', 'Localized route path is already owned by another resource', { route_path: routePath })
    }
    throw error
  }
  return await getResourceLocalization(db, input.organizationId, input.siteId, resourceType, input.resourceId, locale)
}

function remapNewLocalizedBlockIds(blocks: ContentBlockInput[]): ContentBlockInput[] {
  const ids = new Map<string, string>()
  for (const block of blocks) {
    if (block.id) ids.set(block.id, crypto.randomUUID())
  }
  return blocks.map(block => ({
    ...block,
    id: block.id ? ids.get(block.id) : crypto.randomUUID(),
    parent_block_id: block.parent_block_id ? ids.get(block.parent_block_id) ?? null : null,
  }))
}

export async function putResourceLocalizationForAuthoring(
  db: D1Database,
  input: Parameters<typeof putResourceLocalization>[1] & {
    contentBlocks?: unknown
    expectedDocumentUpdatedAt?: unknown
  },
): Promise<ResourceLocalizationAuthoringRecord> {
  const resourceType = parseLocalizedResourceType(input.resourceType)
  if (resourceType !== 'tenant_blog_post' || input.contentBlocks === undefined) {
    return await putResourceLocalization(db, input)
  }
  if (!Array.isArray(input.contentBlocks) || input.contentBlocks.length === 0) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Translated blog content blocks are required')
  }
  if (input.expectedDocumentUpdatedAt !== undefined && typeof input.expectedDocumentUpdatedAt !== 'string') {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'expected_document_updated_at must be a string')
  }

  const { locale, source } = await assertSiteLanguageEntitlement(db, input.organizationId, input.siteId, input.locale)
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content must be edited through its canonical resource')
  await assertCanonicalResourceExists(db, input.organizationId, input.siteId, resourceType, input.resourceId)
  const values = validateLocalizedValues(resourceType, input.values)
  const vertical = await getSiteVertical(db, input.organizationId, input.siteId)
  const routePath = validateLocalizedRoutePath(resourceType, locale, input.routePath, vertical)
  const existing = await queryFirst<{
    id: string
    route_path: string | null
    document_id: string | null
    created_at: number
    created_by_user_id: string
  }>(db, `
    SELECT id, route_path, document_id, created_at, created_by_user_id
      FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND resource_type = ? AND resource_id = ? AND locale = ?
     LIMIT 1
  `, [input.organizationId, input.siteId, resourceType, input.resourceId, locale])
  const id = existing?.id ?? crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const nowIso = new Date().toISOString()
  const rawBlocks = input.contentBlocks as ContentBlockInput[]
  const requestedBlocks = existing?.document_id ? rawBlocks : remapNewLocalizedBlockIds(rawBlocks)
  const { prepareTenantBlogContentBlocks } = await import('~/server/utils/platform-content')
  const prepared = await prepareTenantBlogContentBlocks(db, requestedBlocks, input.siteId, input.organizationId, nowIso)
  const documentId = existing?.document_id ?? crypto.randomUUID()
  const statements: BatchQuery[] = []
  if (existing?.route_path && existing.route_path !== routePath && routePath) {
    statements.push({
      query: `INSERT INTO site_redirects
        (id, organization_id, site_id, locale, owner_type, owner_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'resource_localization', ?, ?, ?, 301, 'redirect', 'localized_route_change', 'localization', ?, ?)
        ON CONFLICT(site_id, locale, from_path) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id,
          to_path = excluded.to_path, status_code = 301, behavior = 'redirect', reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at`,
      params: [crypto.randomUUID(), input.organizationId, input.siteId, locale, id, existing.route_path, routePath, nowIso, nowIso],
    })
  }
  statements.push({
    query: `INSERT INTO resource_localizations
      (id, organization_id, site_id, resource_type, resource_id, locale, values_json, route_path, document_id,
       created_at, created_by_user_id, updated_at, updated_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, site_id, resource_type, resource_id, locale) DO UPDATE SET
        values_json = excluded.values_json, route_path = excluded.route_path, document_id = excluded.document_id,
        updated_at = excluded.updated_at, updated_by_user_id = excluded.updated_by_user_id`,
    params: [id, input.organizationId, input.siteId, resourceType, input.resourceId, locale, JSON.stringify(values), routePath,
      documentId, existing?.created_at ?? now, existing?.created_by_user_id ?? input.userId, now, input.userId],
  })

  try {
    if (existing?.document_id) {
      if (!input.expectedDocumentUpdatedAt) {
        localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'expected_document_updated_at is required')
      }
      const document = await getContentDocumentById(db, existing.document_id)
      if (!document) throw new HTTPError({ statusCode: 500, statusMessage: 'Localized blog content document is missing' })
      await replaceContentDocumentBlocks(db, document.owner_type, document.owner_id, prepared.blocks, {
        expected_document_updated_at: input.expectedDocumentUpdatedAt,
        additionalQueriesBefore: statements,
        additionalQueriesAfter: prepared.placementQueries,
      })
    } else {
      await createContentDocumentWithBlocks(db, 'tenant_blog', id, prepared.blocks, {
        documentId,
        additionalQueriesBefore: statements,
        additionalQueriesAfter: prepared.placementQueries,
      })
    }
  } catch (error) {
    if (error instanceof Error && /resource_localizations_site_locale_route_unique|UNIQUE constraint failed: resource_localizations\.site_id/.test(error.message)) {
      localizationError(409, 'LOCALIZED_ROUTE_CONFLICT', 'Localized route path is already owned by another resource', { route_path: routePath })
    }
    throw error
  }
  return await getResourceLocalizationForAuthoring(db, input.organizationId, input.siteId, resourceType, input.resourceId, locale)
}

export async function deleteResourceLocalization(
  db: DbClient,
  input: { organizationId: string; siteId: string; resourceType: unknown; resourceId: string; locale: unknown },
): Promise<{ deleted: true; resource_type: LocalizedResourceType; resource_id: string; locale: string }> {
  const resourceType = parseLocalizedResourceType(input.resourceType)
  const { locale, source } = await assertSiteLanguageEntitlement(db, input.organizationId, input.siteId, input.locale)
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content cannot be deleted through localization')
  const row = await queryFirst<{ id: string; document_id: string | null }>(db, `
    SELECT id, document_id FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND resource_type = ? AND resource_id = ? AND locale = ? LIMIT 1
  `, [input.organizationId, input.siteId, resourceType, input.resourceId, locale])
  if (!row) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Exact localized representation was not found', { resource_type: resourceType, resource_id: input.resourceId, locale })
  const statements: BatchQuery[] = [
    { query: `DELETE FROM site_redirects WHERE owner_type = 'resource_localization' AND owner_id = ?`, params: [row.id] },
    { query: 'DELETE FROM resource_localizations WHERE id = ?', params: [row.id] },
  ]
  if (row.document_id) {
    statements.push({
      query: `DELETE FROM media_placements
        WHERE owner_type = 'content_block'
          AND owner_id IN (SELECT id FROM content_blocks WHERE document_id = ?)`,
      params: [row.document_id],
    })
    statements.push({ query: 'DELETE FROM content_documents WHERE id = ?', params: [row.document_id] })
  }
  await executeBatch(db, statements, { operation: 'delete resource localization' })
  return { deleted: true, resource_type: resourceType, resource_id: input.resourceId, locale }
}

export function projectExactLocalizedValues<T extends Record<string, unknown>>(
  canonical: T,
  localization: ResourceLocalizationRecord,
): T {
  return { ...canonical, ...localization.values, locale: localization.locale, route_path: localization.route_path }
}

export async function getProductCatalogLocalization(
  db: DbClient,
  organizationId: string,
  siteId: string,
  localeInput: unknown,
) {
  const { locale, source } = await assertSiteLanguageEntitlement(db, organizationId, siteId, localeInput)
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Product catalog localization requires a secondary locale')
  const rows = await queryAll<{
    id: string
    location_id: string
    category: string
    name: string
    description: string
    localization_id: string | null
    values_json: string | null
    route_path: string | null
  }>(db, `
    SELECT p.id, p.location_id, p.category, p.name, p.description,
           rl.id AS localization_id, rl.values_json, rl.route_path
      FROM products p
      LEFT JOIN resource_localizations rl
        ON rl.organization_id = p.organization_id AND rl.site_id = p.site_id
       AND rl.resource_type = 'product' AND rl.resource_id = p.id AND rl.locale = ?
     WHERE p.organization_id = ? AND p.site_id = ?
     ORDER BY p.location_id, p.sort_order, p.id
  `, [locale, organizationId, siteId])
  return {
    locale,
    products: rows.map(row => ({
      id: row.id,
      location_id: row.location_id,
      source: { category: row.category, name: row.name, description: row.description },
      localization: row.localization_id
        ? { values: JSON.parse(row.values_json!), route_path: row.route_path }
        : null,
    })),
  }
}

export async function syncProductCatalogLocalization(
  db: DbClient,
  input: {
    organizationId: string
    siteId: string
    locale: unknown
    items: unknown
    userId: string
  },
) {
  const { locale, source } = await assertSiteLanguageEntitlement(db, input.organizationId, input.siteId, input.locale)
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Product catalog localization requires a secondary locale')
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 250) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'items must contain 1 to 250 Product localizations')
  }
  const parsed = input.items.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `items[${index}] must be an object`, { index })
    }
    const item = value as Record<string, unknown>
    const unknown = Object.keys(item).filter(key => !['product_id', 'values', 'route_path'].includes(key))
    if (unknown.length || typeof item.product_id !== 'string' || !item.product_id.trim()) {
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `items[${index}] is invalid`, { index, fields: unknown })
    }
    return {
      productId: item.product_id.trim(),
      values: validateLocalizedValues('product', item.values),
      routePathInput: item.route_path,
      index,
    }
  })
  const ids = parsed.map(item => item.productId)
  if (new Set(ids).size !== ids.length) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Product IDs must be unique')
  const placeholders = ids.map(() => '?').join(', ')
  const products = await queryAll<{ id: string }>(db, `SELECT id FROM products WHERE organization_id = ? AND site_id = ? AND id IN (${placeholders})`, [input.organizationId, input.siteId, ...ids])
  const found = new Set(products.map(product => product.id))
  const missing = ids.filter(id => !found.has(id))
  if (missing.length) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'One or more Products were not found', { product_ids: missing })
  const vertical = await getSiteVertical(db, input.organizationId, input.siteId)
  const planned = parsed.map(item => ({ ...item, routePath: validateLocalizedRoutePath('product', locale, item.routePathInput, vertical) }))
  const routePaths = planned.map(item => item.routePath)
  if (new Set(routePaths).size !== routePaths.length) localizationError(409, 'LOCALIZED_ROUTE_CONFLICT', 'Submitted Product routes must be unique')
  const existing = await queryAll<{
    id: string
    resource_id: string
    route_path: string | null
    created_at: number
    created_by_user_id: string
  }>(db, `
    SELECT id, resource_id, route_path, created_at, created_by_user_id
      FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND resource_type = 'product' AND locale = ?
  `, [input.organizationId, input.siteId, locale])
  const byProduct = new Map(existing.map(row => [row.resource_id, row]))
  const submittedIds = new Set(ids)
  const conflicts = existing.filter(row => !submittedIds.has(row.resource_id) && row.route_path && routePaths.includes(row.route_path))
  if (conflicts.length) localizationError(409, 'LOCALIZED_ROUTE_CONFLICT', 'A submitted Product route is already owned', { route_paths: conflicts.map(row => row.route_path) })
  const now = Math.floor(Date.now() / 1000)
  const isoNow = new Date().toISOString()
  const statements: BatchQuery[] = []
  for (const item of planned) {
    const prior = byProduct.get(item.productId)
    const id = prior?.id ?? crypto.randomUUID()
    if (prior?.route_path && prior.route_path !== item.routePath) {
      statements.push({
        query: `INSERT INTO site_redirects
          (id, organization_id, site_id, locale, owner_type, owner_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'resource_localization', ?, ?, ?, 301, 'redirect', 'localized_route_change', 'localization', ?, ?)
          ON CONFLICT(site_id, locale, from_path) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id,
            to_path = excluded.to_path, behavior = 'redirect', reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at`,
        params: [crypto.randomUUID(), input.organizationId, input.siteId, locale, id, prior.route_path, item.routePath, isoNow, isoNow],
      })
    }
    statements.push({
      query: `INSERT INTO resource_localizations
        (id, organization_id, site_id, resource_type, resource_id, locale, values_json, route_path,
         created_at, created_by_user_id, updated_at, updated_by_user_id)
        VALUES (?, ?, ?, 'product', ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, site_id, resource_type, resource_id, locale) DO UPDATE SET
          values_json = excluded.values_json, route_path = excluded.route_path,
          updated_at = excluded.updated_at, updated_by_user_id = excluded.updated_by_user_id`,
      params: [id, input.organizationId, input.siteId, item.productId, locale, JSON.stringify(item.values), item.routePath,
        prior?.created_at ?? now, prior?.created_by_user_id ?? input.userId, now, input.userId],
    })
  }
  try {
    await executeBatch(db, statements, { operation: 'sync product catalog localization' })
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      localizationError(409, 'LOCALIZED_ROUTE_CONFLICT', 'A submitted Product route conflicts with existing localized content')
    }
    throw error
  }
  return { locale, updated_product_ids: ids }
}
