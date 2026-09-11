import { HTTPError } from 'nitro'
import { platformLocale } from '~/shared/platform-locales'
import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { getOrganizationBillingProjection } from '~/server/utils/organization-billing'
import {
  createContentDocumentWithBlocks,
  getContentDocumentById,
  getContentEditorSnapshotForDocument,
  updateContentDocument,
  getContentRepresentation,
  prepareContentDocumentDeletion,
  type ContentDocumentChanges,
  type ContentDocumentKind,
  type ContentBlockInput,
} from '~/server/utils/content/documents'
import { localizationError } from '~/server/utils/localization-errors'
import {
  RESOURCE_LOCALIZATION_REGISTRY,
  parseLocalizedResourceType,
  loadMetafieldDefinitionIndex,
  validateLocalizedRoutePath,
  validateLocalizedValues,
  type LocalizedResourceType,
  type LocalizedValues,
} from '~/server/utils/localization-registry'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'


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
  created_at: string
  created_by_user_id: string
  updated_at: string
  updated_by_user_id: string
}

export interface LocalizedPublicRoute {
  locale: string
  route_path: string
  platform_messages: Record<string, string>
  locale_representations: PublicLocaleRepresentation[]
  representation:
    | { kind: 'document'; document_kind: ContentDocumentKind; resource_type: 'content_document'; resource_id: string; document_id: string }
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
  const source = rows.length === 1 ? rows[0] : undefined
  if (!source || source.locale !== 'en' || source.status !== 'published' || !platformLocale(source.locale)) {
    throw new HTTPError({
      statusCode: 500,
      statusMessage: 'Site source locale integrity check failed',
      data: { code: 'SITE_SOURCE_LOCALE_INTEGRITY', site_id: siteId },
    })
  }
  return { ...source, is_source: Boolean(source.is_source) }
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
  const catalog = platformLocale(locale)
  if (!catalog) localizationError(403, 'PLATFORM_LOCALE_UNAVAILABLE', 'The platform locale is unavailable', { locale })
  const source = await getPersistedSourceLocale(db, organizationId, siteId)
  if (locale === source.locale) return { locale, source: true, platform_messages: { ...catalog.messages } }
  const row = await queryFirst<EntitlementRow & { organization_slug: string | null; site_slug: string | null }>(db, `
    SELECT sl.status AS locale_status,
           o.slug AS organization_slug, s.slug AS site_slug
      FROM sites s
      JOIN organization o ON o.id = s.organization_id
      LEFT JOIN site_locales sl ON sl.organization_id = s.organization_id AND sl.site_id = s.id AND sl.locale = ?
     WHERE s.organization_id = ? AND s.id = ?
     LIMIT 1
  `, [locale, organizationId, siteId])
  if (!row) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Site was not found', { site_id: siteId })
  const plan = (await getOrganizationBillingProjection(db, organizationId)).effectivePlan
  if (plan !== 'growth' || row.locale_status !== 'published') {
    localizationError(402, 'LANGUAGE_ENTITLEMENT_REQUIRED', 'A published language on the Growth plan is required', {
      site_id: siteId,
      locale,
      billing_url: billingUrl(row.organization_slug, row.site_slug),
    })
  }
  return { locale, source: false, platform_messages: { ...catalog.messages } }
}

export async function assertPublicSiteLanguageEntitlement(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locale: string,
) {
  try {
    return await assertSiteLanguageEntitlement(db, organizationId, siteId, locale)
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error
      ? error.status
      : null
    const data = error && typeof error === 'object' && 'data' in error
      ? error.data
      : null
    const code = data && typeof data === 'object' && 'code' in data
      ? data.code
      : null
    if (
      status === 402
      || code === 'LANGUAGE_ENTITLEMENT_REQUIRED'
      || code === 'PLATFORM_LOCALE_UNAVAILABLE'
    ) {
      throw new HTTPError({ statusCode: 404, statusMessage: 'Localized route was not found' })
    }
    throw error
  }
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
): Promise<BatchQuery> {
  const table = RESOURCE_LOCALIZATION_REGISTRY[resourceType].table
  const query = resourceType === 'site'
    ? `SELECT id FROM ${table} WHERE organization_id = ? AND id = ?`
    : `SELECT id FROM ${table} WHERE organization_id = ? AND site_id = ? AND id = ?`
  const params = resourceType === 'site' ? [organizationId, resourceId] : [organizationId, siteId, resourceId]
  const row = await queryFirst<{ id: string }>(db, query, params)
  if (!row || (resourceType === 'site' && resourceId !== siteId)) {
    localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Canonical resource was not found', { resource_type: resourceType, resource_id: resourceId })
  }
  return {
    query: `UPDATE resource_localizations SET resource_id = NULL
      WHERE organization_id = ? AND site_id = ? AND resource_type = ? AND resource_id = ? AND NOT EXISTS (${query})`,
    params: [organizationId, siteId, resourceType, resourceId, ...params],
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
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Primary-language content is not stored as a resource localization')
  const row = await queryFirst<ResourceLocalizationRow>(db, `
    SELECT id, organization_id, site_id, resource_type, resource_id, locale, values_json, route_path,
           created_at, created_by_user_id, updated_at, updated_by_user_id
      FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND resource_type = ? AND resource_id = ? AND locale = ?
     LIMIT 1
  `, [organizationId, siteId, resourceType, resourceId, locale])
  if (!row) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Localized representation was not found', { resource_type: resourceType, resource_id: resourceId, locale })
  return mapLocalization(row)
}

export async function getLocalizationForAuthoring(
  db: DbClient, organizationId: string, siteId: string, resourceType: unknown, resourceId: string, localeInput: unknown,
) {
  if (resourceType !== 'content_document') return getResourceLocalization(db, organizationId, siteId, resourceType, resourceId, localeInput)
  const { locale, source } = await assertSiteLanguageEntitlement(db, organizationId, siteId, localeInput)
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content is edited through its document')
  const document = await getContentRepresentation(db, { rootId: resourceId, locale })
  if (!document || document.organization_id !== organizationId || document.site_id !== siteId) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Document representation was not found')
  const copy = await queryFirst<{ title: string | null; summary: string | null; slug: string | null; path: string | null;
    seo_title: string | null; seo_description: string | null; seo_keywords: string | null; metadata_json: string }>(db,
    'SELECT title, summary, slug, path, seo_title, seo_description, seo_keywords, metadata_json FROM content_documents WHERE id = ?', [document.id])
  if (!copy) throw new HTTPError({ statusCode: 500, statusMessage: 'Document representation disappeared during reading' })
  const { metadata_json, ...fields } = copy
  return { ...document, ...fields, metadata: JSON.parse(metadata_json) as Record<string, unknown>,
    content_blocks: (await getContentEditorSnapshotForDocument(db, document)).blocks }
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
  const entitlement = await assertPublicSiteLanguageEntitlement(db, organizationId, siteId, locale)
  if (entitlement.source) {
    localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Primary-language routes are unprefixed', { locale, route_path: routePath })
  }
  if (!entitlement.platform_messages) {
    localizationError(500, 'PLATFORM_LOCALE_UNAVAILABLE', 'Published platform locale messages are unavailable', { locale })
  }
  const { listPublicLocaleRepresentations, listPublicResourceLocaleRepresentations } = await import('~/server/utils/public-locale-representations')
  const resource = await queryFirst<ResourceLocalizationRow>(db, `
    SELECT id, organization_id, site_id, resource_type, resource_id, locale, values_json, route_path,
           created_at, created_by_user_id, updated_at, updated_by_user_id
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
      platform_messages: entitlement.platform_messages,
      locale_representations: await listPublicResourceLocaleRepresentations(db, {
        organizationId,
        siteId,
        resource: { type: localization.resource_type, id: localization.resource_id },
      }),
      representation: {
        kind: 'resource',
        resource_type: localization.resource_type,
        resource_id: localization.resource_id,
        localization,
      },
    }
  }
  const documentPath = routePath.slice(locale.length + 1) || '/'
  const document = await queryFirst<{ id: string; root_id: string; kind: ContentDocumentKind }>(db, `
    SELECT d.id, d.root_id, d.kind FROM content_documents d JOIN content_documents root ON root.id = d.root_id
     WHERE d.organization_id = ? AND d.site_id = ? AND d.locale = ? AND d.path = ?
       AND d.row_role = 'representation' AND root.row_role = 'root'
       AND (root.kind NOT IN ('article','social_post') OR root.status = 'published') LIMIT 1
  `, [organizationId, siteId, locale, documentPath])
  if (!document) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Localized route was not found', { locale, route_path: routePath })
  const { resolvePublicDocumentSourcePath } = await import('~/server/utils/public-locale-representations')
  return { locale, route_path: routePath, platform_messages: entitlement.platform_messages,
    locale_representations: await listPublicLocaleRepresentations(db, { organizationId, siteId,
      sourcePath: await resolvePublicDocumentSourcePath(db, siteId, document.root_id), documentId: document.root_id }),
    representation: { kind: 'document', document_kind: document.kind, resource_type: 'content_document',
      resource_id: document.root_id, document_id: document.id },
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
  const ownerGuard = await assertCanonicalResourceExists(db, input.organizationId, input.siteId, resourceType, input.resourceId)
  // Which product attributes may be translated is declared by the tenant's
  // metafield definitions, so they are loaded and handed to the validator
  // rather than restated as a list here.
  const definitions = resourceType === 'product' ? await loadMetafieldDefinitionIndex(db, input.organizationId) : undefined
  const values = validateLocalizedValues(resourceType, input.values, definitions)
  const vertical = await getSiteVertical(db, input.organizationId, input.siteId)
  const routePath = validateLocalizedRoutePath(resourceType, locale, input.routePath, vertical)
  const existing = await queryFirst<{ id: string; route_path: string | null; created_at: string; created_by_user_id: string }>(db, `
    SELECT id, route_path, created_at, created_by_user_id
      FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND resource_type = ? AND resource_id = ? AND locale = ?
     LIMIT 1
  `, [input.organizationId, input.siteId, resourceType, input.resourceId, locale])
  const id = existing?.id ?? crypto.randomUUID()
  const now = new Date().toISOString()
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
  statements.push(ownerGuard, publicResourceCacheInvalidationQuery(input.siteId, 'resource-localization-put'))
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

const DOCUMENT_LOCALIZED_METADATA: Record<ContentDocumentKind, readonly string[]> = {
  page: [], article: ['category', 'tags'],
  social_post: ['event', 'offer'], qa: [],
}

export async function putLocalizationForAuthoring(db: D1Database,
  input: Parameters<typeof putResourceLocalization>[1] & { contentBlocks?: unknown; expectedUpdatedAt?: unknown },
) {
  if (input.resourceType !== 'content_document') return putResourceLocalization(db, input)
  const { locale, source } = await assertSiteLanguageEntitlement(db, input.organizationId, input.siteId, input.locale)
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content is edited through its document')
  const root = await getContentDocumentById(db, input.resourceId)
  if (!root || root.row_role !== 'root' || root.organization_id !== input.organizationId || root.site_id !== input.siteId) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Source document was not found')
  if (!input.values || typeof input.values !== 'object' || Array.isArray(input.values)) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'values must be an object')
  const copy = input.values as Record<string, unknown>
  const textFields = ['title', 'summary', 'slug', 'seo_title', 'seo_description', 'seo_keywords'] as const
  if (Object.keys(copy).some(key => key !== 'metadata' && !textFields.some(field => field === key))) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Unknown translated document field')
  const changes: ContentDocumentChanges = { updated_by: input.userId,
    metadata: Object.fromEntries(DOCUMENT_LOCALIZED_METADATA[root.kind].map(key => [key, null])) }
  for (const field of textFields) {
    if (copy[field] == null) { changes[field] = null; continue }
    if (typeof copy[field] !== 'string') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', field + ' must be a string')
    changes[field] = copy[field]
  }
  if (copy.metadata !== undefined) {
    if (!copy.metadata || typeof copy.metadata !== 'object' || Array.isArray(copy.metadata)) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'metadata must be an object')
    const metadata = copy.metadata as Record<string, unknown>
    for (const [key, value] of Object.entries(metadata)) {
      if (!DOCUMENT_LOCALIZED_METADATA[root.kind].includes(key)) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Unknown translated metadata field: ' + key)
      if (key === 'tags') {
        if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'tags must be an array of strings')
      } else if (key === 'event' || key === 'offer') {
        const text = key === 'event' ? 'title' : 'terms_conditions'
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(field => field !== text) || typeof (value as Record<string, unknown>)[text] !== 'string') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', key + ' contains invalid translated fields')
      } else if (typeof value !== 'string') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', key + ' must be a string')
    }
    changes.metadata = { ...changes.metadata, ...metadata }
  }
  if (root.kind === 'qa') {
    if (input.routePath !== undefined && input.routePath !== null) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Q&A has no independent route')
  } else {
    if (typeof input.routePath !== 'string' || !input.routePath.startsWith('/' + locale + '/') || /[?#]/.test(input.routePath) || input.routePath.includes('//')) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'route_path must be a canonical localized path')
    changes.path = input.routePath.slice(locale.length + 1)
    if (root.kind !== 'page') changes.slug = input.routePath.split('/').at(-1)!
  }
  const existing = await getContentRepresentation(db, { rootId: root.id, locale })
  const blocks = input.contentBlocks
  if (blocks !== undefined && !Array.isArray(blocks)) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'content_blocks must be an array')
  if ((root.kind === 'article' || root.kind === 'page') && !existing && (!Array.isArray(blocks) || !blocks.length)) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Translated content blocks are required')
  const requested = blocks === undefined ? undefined : existing ? blocks as ContentBlockInput[] : remapNewLocalizedBlockIds(blocks as ContentBlockInput[])
  const { prepareTenantBlogContentBlocks } = await import('~/server/utils/content/publishing')
  const prepared = requested ? await prepareTenantBlogContentBlocks(db, requested, input.siteId, input.organizationId, new Date().toISOString()) : null
  const after = [...(prepared?.placementQueries ?? []), publicResourceCacheInvalidationQuery(input.siteId, 'document-localization-put')]
  if (existing) {
    if (typeof input.expectedUpdatedAt !== 'string') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'expected_updated_at is required')
    const before: BatchQuery[] = changes.path === undefined ? [] : [{
      query: `INSERT INTO site_redirects
        (id, organization_id, site_id, locale, owner_type, owner_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at)
        SELECT ?, organization_id, site_id, locale, 'content_document', id, '/' || locale || path, ?, 301, 'redirect', 'localized_route_change', 'localization', ?, ?
          FROM content_documents WHERE id = ? AND path IS NOT NULL AND path != ?
        ON CONFLICT(site_id, locale, from_path) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id,
          to_path = excluded.to_path, status_code = 301, behavior = 'redirect', reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at`,
      params: [crypto.randomUUID(), input.routePath, new Date().toISOString(), new Date().toISOString(), existing.id, changes.path],
    }]
    await updateContentDocument(db, existing.id, { expected_updated_at: input.expectedUpdatedAt, changes,
      blocks: prepared?.blocks, additionalQueriesBefore: before, additionalQueriesAfter: after })
  } else {
    await createContentDocumentWithBlocks(db, { organizationId: input.organizationId, siteId: input.siteId,
      kind: root.kind, rowRole: 'representation', rootId: root.id, locale,
      title: changes.title, summary: changes.summary, slug: changes.slug, path: changes.path,
      seoTitle: changes.seo_title, seoDescription: changes.seo_description, seoKeywords: changes.seo_keywords,
      metadata: changes.metadata, createdBy: input.userId, updatedBy: input.userId,
    }, prepared?.blocks ?? [], { additionalQueriesAfter: after })
  }
  return getLocalizationForAuthoring(db, input.organizationId, input.siteId, 'content_document', root.id, locale)
}

export function resourceLocalizationDeletionQueries(resourceType: LocalizedResourceType, resourceIds: BatchQuery, locale?: string): BatchQuery[] {
  const owners = `SELECT id FROM resource_localizations WHERE resource_type = ? AND resource_id IN (${resourceIds.query})${locale === undefined ? '' : ' AND locale = ?'}`
  const params = [resourceType, ...(resourceIds.params ?? []), ...(locale === undefined ? [] : [locale])]
  return [
    { query: `DELETE FROM site_redirects WHERE owner_type = 'resource_localization' AND owner_id IN (${owners})`, params },
    { query: `DELETE FROM resource_localizations WHERE id IN (${owners})`, params },
  ]
}

export async function deleteLocalization(
  db: DbClient,
  input: { organizationId: string; siteId: string; resourceType: unknown; resourceId: string; locale: unknown },
): Promise<{ deleted: true; resource_type: LocalizedResourceType | 'content_document'; resource_id: string; locale: string }> {
  if (input.resourceType === 'content_document') {
    const { locale, source } = await assertSiteLanguageEntitlement(db, input.organizationId, input.siteId, input.locale)
    if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content cannot be deleted through localization')
    const document = await getContentRepresentation(db, { rootId: input.resourceId, locale })
    if (!document || document.organization_id !== input.organizationId || document.site_id !== input.siteId) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Document representation was not found')
    await executeBatch(db, [...prepareContentDocumentDeletion({ documentId: document.id, organizationId: input.organizationId, siteId: input.siteId }), publicResourceCacheInvalidationQuery(input.siteId, 'document-localization-delete')])
    return { deleted: true, resource_type: 'content_document', resource_id: input.resourceId, locale }
  }
  const resourceType = parseLocalizedResourceType(input.resourceType)
  const { locale, source } = await assertSiteLanguageEntitlement(db, input.organizationId, input.siteId, input.locale)
  if (source) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content cannot be deleted through localization')
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND resource_type = ? AND resource_id = ? AND locale = ? LIMIT 1
  `, [input.organizationId, input.siteId, resourceType, input.resourceId, locale])
  if (!row) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Localized representation was not found', { resource_type: resourceType, resource_id: input.resourceId, locale })
  const statements = resourceLocalizationDeletionQueries(resourceType, {
    query: 'SELECT resource_id FROM resource_localizations WHERE id = ?', params: [row.id],
  }, locale)
  statements.push(publicResourceCacheInvalidationQuery(input.siteId, 'resource-localization-delete'))
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
  // Products belong to the organization and reach this site through a
  // publication; collections are the site's own merchandising. Both are listed
  // in the order the public pages render them, so a translator works down the
  // page rather than down a join.
  const [rows, collectionRows] = await Promise.all([queryAll<{
    id: string
    name: string
    description: string
    localization_id: string | null
    values_json: string | null
    route_path: string | null
  }>(db, `
    SELECT p.id, p.name, p.description,
           rl.id AS localization_id, rl.values_json, rl.route_path
      FROM products p
      JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id AND pub.site_id = ?
      LEFT JOIN resource_localizations rl
        ON rl.organization_id = p.organization_id AND rl.site_id = pub.site_id
       AND rl.resource_type = 'product' AND rl.resource_id = p.id AND rl.locale = ?
     WHERE p.organization_id = ?
     ORDER BY p.name, p.id
  `, [siteId, locale, organizationId]), queryAll<{
    id: string
    location_id: string | null
    name: string
    localization_id: string | null
    values_json: string | null
  }>(db, `
    SELECT c.id, c.location_id, c.name, rl.id AS localization_id, rl.values_json
      FROM collections c
      LEFT JOIN resource_localizations rl
        ON rl.organization_id = c.organization_id AND rl.site_id = c.site_id
       AND rl.resource_type = 'collection' AND rl.resource_id = c.id AND rl.locale = ?
     WHERE c.organization_id = ? AND c.site_id = ?
     ORDER BY c.sort_order, c.id
  `, [locale, organizationId, siteId])])
  return {
    locale,
    collections: collectionRows.map(row => ({
      id: row.id,
      location_id: row.location_id,
      source: { name: row.name },
      localization: row.localization_id ? { values: JSON.parse(row.values_json!) } : null,
    })),
    products: rows.map(row => ({
      id: row.id,
      source: { name: row.name, description: row.description },
      localization: row.localization_id
        ? { values: JSON.parse(row.values_json!), route_path: row.route_path }
        : null,
    })),
  }
}

export async function replaceProductLocalizations(
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
  const definitions = await loadMetafieldDefinitionIndex(db, input.organizationId)
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
      values: validateLocalizedValues('product', item.values, definitions),
      routePathInput: item.route_path,
      index,
    }
  })
  const ids = parsed.map(item => item.productId)
  if (new Set(ids).size !== ids.length) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Product IDs must be unique')
  const placeholders = ids.map(() => '?').join(', ')
  // The catalog is organization-owned; a site reaches a product through its
  // publication row, so that is what scopes this lookup.
  const products = await queryAll<{ id: string }>(db, `
    SELECT p.id FROM products p
    JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
    WHERE p.organization_id = ? AND pub.site_id = ? AND p.id IN (${placeholders})
  `, [input.organizationId, input.siteId, ...ids])
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
    created_at: string
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
  const now = new Date().toISOString()
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
        params: [crypto.randomUUID(), input.organizationId, input.siteId, locale, id, prior.route_path, item.routePath, now, now],
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
  statements.push({
    query: `UPDATE resource_localizations SET resource_id = NULL
      WHERE organization_id = ? AND site_id = ? AND resource_type = 'product' AND locale = ?
        AND resource_id IN (SELECT value FROM json_each(?))
        AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = resource_localizations.resource_id AND p.organization_id = resource_localizations.organization_id AND p.site_id = resource_localizations.site_id)`,
    params: [input.organizationId, input.siteId, locale, JSON.stringify(ids)],
  })
  try {
    await executeBatch(db, statements, { operation: 'replace product localizations' })
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      localizationError(409, 'LOCALIZED_ROUTE_CONFLICT', 'A submitted Product route conflicts with existing localized content')
    }
    throw error
  }
  return { locale, updated_product_ids: ids }
}
