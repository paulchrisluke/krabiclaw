import { createError } from 'h3'
import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import {
  createContentDocumentWithBlocks,
  getContentDocumentById,
  getContentDocumentByOwner,
  getContentEditorSnapshot,
  replaceContentDocumentBlocks,
  type ContentBlockInput,
} from '~/server/utils/content-documents'
import {
  normalizeTenantPageBlocks,
  normalizeTenantPagePath,
  validateTenantPageSnapshot,
  blockDefinition,
  type TenantPageBlock,
  type TenantPageSnapshotMetadata,
} from '~/utils/tenant-page-blocks'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { normalizeDomain } from '~/server/utils/domain-shared'
import { normalizeLocale } from '~/server/utils/site-i18n'

export type TenantPageStatus = 'draft' | 'published' | 'archived'
export type TenantPageType = 'custom' | 'recipe' | 'legal' | 'system'

export interface TenantPageEditorInput {
  id?: string
  pageId?: string
  locale?: string
  path: string
  title: string
  summary?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  canonicalUrl?: string | null
  robots?: string | null
  pageType?: TenantPageType
  recipe?: string | null
  sortOrder?: number | null
  blocks: unknown
  publish?: boolean
  expectedDocumentUpdatedAt?: string | null
}

export interface TenantPageDocument {
  id: string
  updated_at: string
  draft_revision_id: string | null
  published_revision_id: string | null
}

export interface TenantPageDto {
  id: string
  page_id: string
  site_id: string
  organization_id: string
  locale: string
  path: string
  published_path: string
  draft_path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  page_type: TenantPageType
  recipe: string | null
  sort_order: number
  status: TenantPageStatus
  blocks: TenantPageBlock[]
  document: TenantPageDocument
  published_revision_id: string | null
  updated_at: string
}

interface TenantPageVariantRow {
  variant_id: string
  page_id: string
  organization_id: string
  site_id: string
  locale: string
  published_path: string
  draft_path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  page_type: TenantPageType
  recipe: string | null
  sort_order: number
  status: TenantPageStatus
  ever_published: number
  draft_document_id: string | null
  published_revision_id: string | null
  updated_at: string
}

const RESERVED_EXACT_PATHS = new Set([
  '/api', '/_nuxt', '/sitemap.xml', '/robots.txt', '/admin', '/dashboard',
  '/login', '/signup', '/oauth', '/account', '/auth', '/docs', '/dev',
  '/preview', '/templates', '/features', '/privacy', '/terms', '/blog',
  '/menu', '/order', '/experiences', '/reservations', '/locations', '/contact',
  '/links', '/services', '/article',
])

const RESERVED_PREFIXES = [
  '/api/', '/_nuxt/', '/admin/', '/dashboard/', '/login/', '/signup/',
  '/oauth/', '/account/', '/auth/', '/docs/', '/dev/', '/preview/',
  '/templates/', '/features/', '/blog/', '/menu/', '/order/', '/experiences/',
  '/reservations/', '/locations/', '/services/', '/article/',
]

function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

function notFound(message: string): never {
  throw createError({ statusCode: 404, statusMessage: message })
}

function conflict(message: string): never {
  throw createError({ statusCode: 409, statusMessage: message })
}

function asString(value: unknown, field: string, required = false): string | null {
  if (value == null || value === '') {
    if (required) badRequest(field + ' is required')
    return null
  }
  if (typeof value !== 'string') badRequest(field + ' must be a string')
  return value.trim()
}

function parseSnapshot(value: string): { metadata: TenantPageSnapshotMetadata; blocks: TenantPageBlock[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw createError({ statusCode: 500, statusMessage: 'Tenant page revision is malformed', cause: error })
  }
  const snapshot = validateTenantPageSnapshot(parsed)
  return { metadata: snapshot.metadata, blocks: snapshot.blocks }
}

function metadataForInput(input: TenantPageEditorInput, locale: string, path: string): TenantPageSnapshotMetadata {
  const pageType = input.pageType ?? 'custom'
  if (!['custom', 'recipe', 'legal', 'system'].includes(pageType)) badRequest('pageType is invalid')
  return {
    locale,
    path,
    title: asString(input.title, 'title', true)!,
    summary: asString(input.summary, 'summary'),
    seoTitle: asString(input.seoTitle, 'seoTitle'),
    seoDescription: asString(input.seoDescription, 'seoDescription'),
    canonicalUrl: asString(input.canonicalUrl, 'canonicalUrl'),
    robots: asString(input.robots, 'robots'),
    pageType,
    recipe: asString(input.recipe, 'recipe'),
  }
}

async function assertTenantPageSupport(db: DbClient, siteId: string, input: TenantPageEditorInput, blocks: TenantPageBlock[], options: { checkCustomPageEntitlement?: boolean } = {}) {
  const pageType = input.pageType ?? 'custom'
  if (pageType === 'custom' && options.checkCustomPageEntitlement !== false && !(await hasSiteEntitlement(db, siteId, 'custom_pages'))) {
    throw createError({ statusCode: 402, statusMessage: 'Custom tenant pages require the Growth plan or higher' })
  }
  const recipe = input.recipe?.trim() || null
  if (pageType === 'recipe' && !recipe) badRequest('recipe is required for recipe pages')
  if (recipe) {
    for (const block of blocks) {
      if (!blockDefinition(block.type).allowedRecipes.includes(recipe)) {
        badRequest(`Block type "${block.type}" is not supported by recipe "${recipe}"`)
      }
    }
  }
  const canonicalUrl = input.canonicalUrl?.trim() || null
  if (canonicalUrl) {
    let parsed: URL
    try { parsed = new URL(canonicalUrl) } catch { badRequest('canonicalUrl must be an absolute HTTP(S) URL') }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) badRequest('canonicalUrl must be an absolute HTTP(S) URL')
    const allowedHosts = await queryAll<{ domain: string }>(db, `
      SELECT domain FROM site_domains WHERE site_id = ? AND status = 'active'
      UNION
      SELECT subdomain AS domain FROM sites WHERE id = ? AND subdomain IS NOT NULL
      UNION
      SELECT custom_domain AS domain FROM sites WHERE id = ? AND custom_domain IS NOT NULL
    `, [siteId, siteId, siteId])
    if (!allowedHosts.some(row => normalizeDomain(row.domain) === normalizeDomain(parsed.hostname))) {
      badRequest('canonicalUrl must use an approved domain for this site')
    }
  }
}

function blocksAsInputs(blocks: TenantPageBlock[]): ContentBlockInput[] {
  return blocks.map(block => ({ id: block.id, type: block.type, position: block.position, data: block.data }))
}

function isReservedPath(path: string): boolean {
  return RESERVED_EXACT_PATHS.has(path) || RESERVED_PREFIXES.some(prefix => path.startsWith(prefix))
}

function documentConcurrencyGuard(documentId: string, expectedUpdatedAt: string): BatchQuery {
  return {
    query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
      SELECT ?, ?, NULL, '__content_document_concurrency_guard__', 0, NULL, '{}', ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM content_documents WHERE id = ? AND updated_at = ?)`,
    params: [crypto.randomUUID(), documentId, expectedUpdatedAt, expectedUpdatedAt, documentId, expectedUpdatedAt],
  }
}

export interface TenantPageScope {
  siteId: string
  organizationId: string
}

async function getVariantRow(db: DbClient, variantId: string, scope?: TenantPageScope): Promise<TenantPageVariantRow | null> {
  return await queryFirst<TenantPageVariantRow | null>(db, [
    'SELECT v.id AS variant_id, v.page_id, v.organization_id, v.site_id, v.locale, v.published_path, v.draft_path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url, v.robots,',
    '       p.page_type, p.recipe, p.sort_order, v.status, v.ever_published, v.draft_document_id, v.published_revision_id, v.updated_at',
    '  FROM tenant_page_variants v JOIN tenant_pages p ON p.id = v.page_id',
    ' WHERE v.id = ? AND (? IS NULL OR v.site_id = ?) AND (? IS NULL OR v.organization_id = ?) LIMIT 1',
  ].join('\n'), [variantId, scope?.siteId ?? null, scope?.siteId ?? null, scope?.organizationId ?? null, scope?.organizationId ?? null])
}

async function resolveLocale(db: DbClient, siteId: string, locale?: string | null): Promise<string> {
  const normalizedLocale = normalizeLocale(locale)
  if (locale?.trim()) {
    if (!normalizedLocale) notFound('Locale is not configured for this site')
    const row = await queryFirst<{ locale: string } | null>(
      db,
      "SELECT locale FROM site_locales WHERE site_id = ? AND locale = ? AND status IN ('active', 'published') LIMIT 1",
      [siteId, normalizedLocale],
    )
    if (!row) notFound('Locale is not configured for this site')
    return row.locale
  }
  const row = await queryFirst<{ locale: string | null }>(
    db,
    'SELECT COALESCE((SELECT locale FROM site_locales WHERE site_id = ? AND is_source = 1 LIMIT 1), source_locale) AS locale FROM sites WHERE id = ? LIMIT 1',
    [siteId, siteId],
  )
  if (!row?.locale) throw createError({ statusCode: 500, statusMessage: 'Source locale is not configured for this site' })
  return row.locale
}

export async function assertTenantPagePathAvailable(
  db: DbClient,
  input: { siteId: string; locale: string; path: string; excludeVariantId?: string | null; allowSystemPath?: boolean; allowOwnedRedirectVariantId?: string | null },
) {
  const path = normalizeTenantPagePath(input.path)
  if (isReservedPath(path) && !input.allowSystemPath) conflict('This path is reserved by a platform or product route')
  const row = await queryFirst<{ id: string } | null>(db, [
    'SELECT id FROM tenant_page_variants',
    'WHERE site_id = ? AND locale = ? AND (published_path = ? OR draft_path = ?)',
    '  AND (? IS NULL OR id <> ?) LIMIT 1',
  ].join('\n'), [input.siteId, input.locale, path, path, input.excludeVariantId ?? null, input.excludeVariantId ?? null])
  if (row) conflict('A tenant page already uses this path for the selected locale')
  const redirect = await queryFirst<{ id: string } | null>(db, `
    SELECT id FROM tenant_redirects
     WHERE site_id = ? AND locale = ? AND from_path = ?
       AND (? IS NULL OR owner_variant_id IS NULL OR owner_variant_id <> ?)
     LIMIT 1
  `, [input.siteId, input.locale, path, input.allowOwnedRedirectVariantId ?? null, input.allowOwnedRedirectVariantId ?? null])
  if (redirect) conflict('A tenant redirect already owns this path')
  return path
}

async function assertTenantPageRedirectWritable(
  db: DbClient,
  input: { siteId: string; organizationId: string; locale: string; fromPath: string; variantId: string },
) {
  const existing = await queryFirst<{ owner_variant_id: string | null; source: string } | null>(db, `
    SELECT owner_variant_id, source
      FROM tenant_redirects
     WHERE site_id = ? AND organization_id = ? AND locale = ? AND from_path = ?
     LIMIT 1
  `, [input.siteId, input.organizationId, input.locale, input.fromPath])
  if (existing && (existing.owner_variant_id !== input.variantId || existing.source !== 'tenant-pages')) {
    conflict('A manual tenant redirect already owns this path')
  }
}

async function assertTenantPageRedirectLocaleSafe(
  db: DbClient,
  input: { siteId: string; locale: string; fromPath: string; variantId: string },
) {
  const owner = await queryFirst<{ locale: string } | null>(db, `
    SELECT locale
      FROM tenant_page_variants
     WHERE site_id = ? AND locale <> ? AND published_path = ?
       AND status = 'published' AND published_revision_id IS NOT NULL AND id <> ?
     LIMIT 1
  `, [input.siteId, input.locale, input.fromPath, input.variantId])
  if (owner) conflict('A locale-specific redirect cannot replace a path still published by another locale')
}

function pageDto(row: TenantPageVariantRow, document: TenantPageDocument, blocks: TenantPageBlock[]): TenantPageDto {
  return {
    id: row.variant_id,
    page_id: row.page_id,
    site_id: row.site_id,
    organization_id: row.organization_id,
    locale: row.locale,
    path: row.draft_path,
    published_path: row.published_path,
    draft_path: row.draft_path,
    title: row.title,
    summary: row.summary,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    canonical_url: row.canonical_url,
    robots: row.robots,
    page_type: row.page_type,
    recipe: row.recipe,
    sort_order: row.sort_order,
    status: row.status,
    blocks,
    document,
    published_revision_id: row.published_revision_id,
    updated_at: row.updated_at,
  }
}

export async function listTenantPages(db: DbClient, siteId: string, opts: { locale?: string | null } = {}) {
  const locale = await resolveLocale(db, siteId, opts.locale)
  const rows = await queryAll<TenantPageVariantRow>(db, [
    'SELECT v.id AS variant_id, v.page_id, v.organization_id, v.site_id, v.locale, v.published_path, v.draft_path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url, v.robots,',
    '       p.page_type, p.recipe, p.sort_order, v.status, v.ever_published, v.draft_document_id, v.published_revision_id, v.updated_at',
    '  FROM tenant_page_variants v JOIN tenant_pages p ON p.id = v.page_id',
    ' WHERE v.site_id = ? AND v.locale = ? ORDER BY p.sort_order ASC, v.title ASC',
  ].join('\n'), [siteId, locale])
  return rows.map(row => ({
    id: row.variant_id,
    page_id: row.page_id,
    locale: row.locale,
    path: row.draft_path,
    published_path: row.published_path,
    draft_path: row.draft_path,
    title: row.title,
    page_type: row.page_type,
    recipe: row.recipe,
    sort_order: row.sort_order,
    status: row.status,
    updated_at: row.updated_at,
    published_revision_id: row.published_revision_id,
  }))
}

export async function getTenantPageForEditor(db: DbClient, variantId: string, scope?: TenantPageScope): Promise<TenantPageDto> {
  const row = await getVariantRow(db, variantId, scope)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  const snapshot = await getContentEditorSnapshot(db, 'tenant_page', variantId)
  return pageDto(row, document, (snapshot?.blocks ?? []) as TenantPageBlock[])
}

export async function getPublishedTenantPage(db: DbClient, siteId: string, path: string, locale?: string | null): Promise<TenantPageDto | null> {
  const resolvedLocale = await resolveLocale(db, siteId, locale)
  const normalizedPath = normalizeTenantPagePath(path)
  const selectPublished = async (candidateLocale: string) => await queryFirst<TenantPageVariantRow | null>(db, [
    'SELECT v.id AS variant_id, v.page_id, v.organization_id, v.site_id, v.locale, v.published_path, v.draft_path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url, v.robots,',
    '       p.page_type, p.recipe, p.sort_order, v.status, v.ever_published, v.draft_document_id, v.published_revision_id, v.updated_at',
    '  FROM tenant_page_variants v JOIN tenant_pages p ON p.id = v.page_id',
    " WHERE v.site_id = ? AND v.locale = ? AND v.published_path = ? AND v.status = 'published'",
    '   AND v.published_revision_id IS NOT NULL LIMIT 1',
  ].join('\n'), [siteId, candidateLocale, normalizedPath])
  let row = await selectPublished(resolvedLocale)
  if (!row && locale?.trim()) {
    const fallback = await queryFirst<{ locale: string } | null>(db, `
      SELECT source.locale
        FROM site_locales requested
        JOIN site_locales source ON source.site_id = requested.site_id AND source.is_source = 1
       WHERE requested.site_id = ? AND requested.locale = ?
         AND requested.status IN ('active', 'published')
         AND requested.fallback_enabled = 1
       LIMIT 1
    `, [siteId, resolvedLocale])
    if (fallback?.locale && fallback.locale !== resolvedLocale) row = await selectPublished(fallback.locale)
  }
  if (!row || !row.draft_document_id) return null
  const document = await getContentDocumentByOwner(db, 'tenant_page', row.variant_id)
  const revision = await queryFirst<{ snapshot_json: string } | null>(db, `
    SELECT snapshot_json FROM content_revisions
    WHERE id = ? AND document_id = ? LIMIT 1
  `, [row.published_revision_id, document?.id ?? null])
  if (!document || !revision) throw createError({ statusCode: 500, statusMessage: 'Published tenant page content is unavailable' })
  const snapshot = parseSnapshot(revision.snapshot_json)
  const publishedRow: TenantPageVariantRow = {
    ...row,
    published_path: snapshot.metadata.path,
    title: snapshot.metadata.title,
    summary: snapshot.metadata.summary,
    seo_title: snapshot.metadata.seoTitle,
    seo_description: snapshot.metadata.seoDescription,
    canonical_url: snapshot.metadata.canonicalUrl,
    robots: snapshot.metadata.robots,
    page_type: snapshot.metadata.pageType as TenantPageType,
    recipe: snapshot.metadata.recipe,
  }
  return pageDto(publishedRow, document, snapshot.blocks)
}

export async function createTenantPage(db: DbClient, input: { organizationId: string; siteId: string; userId: string | null; data: TenantPageEditorInput; trustedSystemPage?: boolean }) {
  const locale = await resolveLocale(db, input.siteId, input.data.locale)
  if (input.data.pageType === 'system' && !input.trustedSystemPage) badRequest('System pages are managed by the site template')
  const path = await assertTenantPagePathAvailable(db, { siteId: input.siteId, locale, path: input.data.path, allowSystemPath: input.trustedSystemPage === true })
  const metadata = metadataForInput(input.data, locale, path)
  const blocks = normalizeTenantPageBlocks(input.data.blocks)
  await assertTenantPageSupport(db, input.siteId, input.data, blocks)
  const pageId = input.data.pageId ?? crypto.randomUUID()
  const variantId = input.data.id ?? crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const revisionId = crypto.randomUUID()
  const now = new Date().toISOString()
  const publish = input.data.publish === true
  const pageStatus: TenantPageStatus = publish ? 'published' : 'draft'
  const pageQuery: BatchQuery = {
    query: "INSERT INTO tenant_pages (id, organization_id, site_id, path, title, slug, page_type, recipe, summary, status, sort_order, source, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pages', ?, ?)",
    params: [pageId, input.organizationId, input.siteId, path, metadata.title, path === '/' ? 'home' : path.slice(1).replaceAll('/', '-'), metadata.pageType, metadata.recipe, metadata.summary, pageStatus, now, input.userId],
  }
  const variantQuery: BatchQuery = {
    query: "INSERT INTO tenant_page_variants (id, organization_id, site_id, page_id, locale, draft_document_id, published_path, draft_path, title, summary, seo_title, seo_description, canonical_url, robots, status, ever_published, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    params: [variantId, input.organizationId, input.siteId, pageId, locale, documentId, path, path, metadata.title, metadata.summary, metadata.seoTitle, metadata.seoDescription, metadata.canonicalUrl, metadata.robots, pageStatus, publish ? 1 : 0, now, now, input.userId],
  }
  const result = await createContentDocumentWithBlocks(db, 'tenant_page', variantId, blocksAsInputs(blocks), {
    documentId,
    revisionId,
    snapshotMetadata: metadata as unknown as Record<string, unknown>,
    createdBy: input.userId,
    label: 'Tenant page draft',
    publish,
    additionalQueriesBefore: [pageQuery, variantQuery],
    additionalQueriesAfter: [{
      query: 'UPDATE tenant_page_variants SET published_revision_id = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      params: [publish ? revisionId : null, now, input.userId, variantId],
    }],
  })
  return { page: await getTenantPageForEditor(db, variantId), revision_id: result.revision_id }
}

export async function updateTenantPageDraft(db: DbClient, variantId: string, input: { userId: string | null; data: TenantPageEditorInput; scope: TenantPageScope }) {
  const row = await getVariantRow(db, variantId, input.scope)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (!input.data.expectedDocumentUpdatedAt || document.updated_at !== input.data.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const pageType = input.data.pageType ?? row.page_type
  if (pageType === 'system' && row.page_type !== 'system') badRequest('Only an existing system page may remain a system page')
  const effectiveInput = {
    ...input.data,
    pageType,
    title: input.data.title ?? row.title,
    summary: input.data.summary === undefined ? row.summary : input.data.summary,
    seoTitle: input.data.seoTitle === undefined ? row.seo_title : input.data.seoTitle,
    seoDescription: input.data.seoDescription === undefined ? row.seo_description : input.data.seoDescription,
    canonicalUrl: input.data.canonicalUrl === undefined ? row.canonical_url : input.data.canonicalUrl,
    robots: input.data.robots === undefined ? row.robots : input.data.robots,
    recipe: input.data.recipe === undefined ? row.recipe : input.data.recipe,
  }
  const path = await assertTenantPagePathAvailable(db, { siteId: row.site_id, locale: row.locale, path: input.data.path ?? row.draft_path, excludeVariantId: variantId, allowSystemPath: row.page_type === 'system' })
  const metadata = metadataForInput(effectiveInput, row.locale, path)
  const blocks = normalizeTenantPageBlocks(input.data.blocks)
  await assertTenantPageSupport(db, row.site_id, effectiveInput, blocks, { checkCustomPageEntitlement: row.page_type !== 'custom' && pageType === 'custom' })
  const revisionId = crypto.randomUUID()
  const now = new Date().toISOString()
  const pageStatus: TenantPageStatus = row.published_revision_id ? 'published' : 'draft'
  const updateVariant: BatchQuery = {
    query: 'UPDATE tenant_page_variants SET draft_path = ?, title = ?, summary = ?, seo_title = ?, seo_description = ?, canonical_url = ?, robots = ?, status = ?, updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ?',
    params: [path, metadata.title, metadata.summary, metadata.seoTitle, metadata.seoDescription, metadata.canonicalUrl, metadata.robots, pageStatus, now, input.userId, variantId, input.scope.siteId, input.scope.organizationId],
  }
  const updatePage: BatchQuery = {
    query: `UPDATE tenant_pages SET
      title = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE title END,
      page_type = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE page_type END,
      recipe = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE recipe END,
      summary = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE summary END,
      status = CASE
        WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'published') THEN 'published'
        WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'draft') THEN 'draft'
        ELSE 'archived'
      END,
      sort_order = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN COALESCE(?, sort_order) ELSE sort_order END,
      updated_at = ?, updated_by = ?
      WHERE id = ? AND site_id = ? AND organization_id = ?`,
    params: [
      input.scope.siteId, row.locale, metadata.title,
      input.scope.siteId, row.locale, metadata.pageType,
      input.scope.siteId, row.locale, metadata.recipe,
      input.scope.siteId, row.locale, metadata.summary,
      input.scope.siteId, row.locale, input.data.sortOrder ?? null,
      now, input.userId, row.page_id, input.scope.siteId, input.scope.organizationId,
    ],
  }
  const result = await replaceContentDocumentBlocks(db, 'tenant_page', variantId, blocksAsInputs(blocks), {
    expected_document_updated_at: input.data.expectedDocumentUpdatedAt,
    revisionId,
    snapshotMetadata: metadata as unknown as Record<string, unknown>,
    createdBy: input.userId,
    label: 'Tenant page draft',
    publish: false,
    additionalQueriesAfter: [updateVariant, updatePage],
  })
  return { page: await getTenantPageForEditor(db, variantId, input.scope), revision_id: result.revision_id }
}

interface TenantPageLifecycleInput {
  userId: string
  expectedDocumentUpdatedAt: string
  scope: TenantPageScope
}

export async function publishTenantPage(db: DbClient, variantId: string, input: TenantPageLifecycleInput) {
  const row = await getVariantRow(db, variantId, input.scope)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document?.draft_revision_id) badRequest('Tenant page has no draft revision')
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const revision = await queryFirst<{ snapshot_json: string } | null>(db, 'SELECT snapshot_json FROM content_revisions WHERE id = ? AND document_id = ? LIMIT 1', [document.draft_revision_id, document.id])
  if (!revision) throw createError({ statusCode: 500, statusMessage: 'Tenant page draft revision is unavailable' })
  const snapshot = parseSnapshot(revision.snapshot_json)
  if (snapshot.metadata.locale !== row.locale) badRequest('Tenant page draft locale does not match its variant')
  const effectiveInput: TenantPageEditorInput = {
    path: snapshot.metadata.path,
    title: snapshot.metadata.title,
    summary: snapshot.metadata.summary,
    seoTitle: snapshot.metadata.seoTitle,
    seoDescription: snapshot.metadata.seoDescription,
    canonicalUrl: snapshot.metadata.canonicalUrl,
    robots: snapshot.metadata.robots,
    pageType: snapshot.metadata.pageType as TenantPageType,
    recipe: snapshot.metadata.recipe,
    blocks: snapshot.blocks,
  }
  await assertTenantPageSupport(db, row.site_id, effectiveInput, snapshot.blocks)
  const publishPath = await assertTenantPagePathAvailable(db, {
    siteId: row.site_id,
    locale: row.locale,
    path: snapshot.metadata.path,
    excludeVariantId: variantId,
    allowSystemPath: snapshot.metadata.pageType === 'system',
  })
  if (row.published_path !== publishPath) {
    await assertTenantPageRedirectLocaleSafe(db, {
      siteId: row.site_id,
      locale: row.locale,
      fromPath: row.published_path,
      variantId,
    })
    await assertTenantPageRedirectWritable(db, {
      siteId: row.site_id,
      organizationId: row.organization_id,
      locale: row.locale,
      fromPath: row.published_path,
      variantId,
    })
  }
  const now = new Date().toISOString()
  await executeBatch(db, [
    documentConcurrencyGuard(document.id, input.expectedDocumentUpdatedAt),
    { query: 'UPDATE content_documents SET published_revision_id = ?, updated_at = ? WHERE id = ? AND updated_at = ?', params: [document.draft_revision_id, now, document.id, input.expectedDocumentUpdatedAt] },
    { query: "UPDATE tenant_page_variants SET published_revision_id = ?, published_path = ?, draft_path = ?, title = ?, summary = ?, seo_title = ?, seo_description = ?, canonical_url = ?, robots = ?, status = 'published', ever_published = 1, updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ?", params: [document.draft_revision_id, publishPath, publishPath, snapshot.metadata.title, snapshot.metadata.summary, snapshot.metadata.seoTitle, snapshot.metadata.seoDescription, snapshot.metadata.canonicalUrl, snapshot.metadata.robots, now, input.userId, variantId, input.scope.siteId, input.scope.organizationId] },
    { query: `UPDATE tenant_pages SET
        title = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE title END,
        page_type = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE page_type END,
        recipe = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE recipe END,
        summary = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE summary END,
        path = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE path END,
        status = CASE
          WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'published') THEN 'published'
          WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'draft') THEN 'draft'
          ELSE 'archived'
        END,
        updated_at = ?, updated_by = ?
        WHERE id = ? AND site_id = ? AND organization_id = ?`, params: [
      input.scope.siteId, row.locale, snapshot.metadata.title,
      input.scope.siteId, row.locale, snapshot.metadata.pageType,
      input.scope.siteId, row.locale, snapshot.metadata.recipe,
      input.scope.siteId, row.locale, snapshot.metadata.summary,
      input.scope.siteId, row.locale, publishPath,
      now, input.userId, row.page_id, input.scope.siteId, input.scope.organizationId,
    ] },
    ...(row.published_path !== publishPath ? [
      { query: "UPDATE tenant_redirects SET to_path = ?, updated_at = ? WHERE site_id = ? AND organization_id = ? AND locale = ? AND source = 'tenant-pages' AND owner_variant_id = ? AND to_path = ?", params: [publishPath, now, input.scope.siteId, input.scope.organizationId, row.locale, variantId, row.published_path] },
      { query: "INSERT INTO tenant_redirects (id, organization_id, site_id, locale, owner_variant_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 301, 'redirect', 'tenant_page_path_change', 'tenant-pages', ?, ?) ON CONFLICT(site_id, locale, from_path) DO UPDATE SET owner_variant_id = excluded.owner_variant_id, to_path = excluded.to_path, status_code = excluded.status_code, behavior = excluded.behavior, reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at", params: [crypto.randomUUID(), row.organization_id, row.site_id, row.locale, variantId, row.published_path, publishPath, now, now] },
      { query: "UPDATE tenant_navigation_items SET url = ?, updated_at = ?, updated_by = ? WHERE organization_id = ? AND site_id = ? AND item_type = 'internal' AND url = ? AND EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1)", params: [publishPath, now, input.userId, input.scope.organizationId, input.scope.siteId, row.published_path, input.scope.siteId, row.locale] },
    ] : []),
  ])
  return await getTenantPageForEditor(db, variantId, input.scope)
}

export async function unpublishTenantPage(db: DbClient, variantId: string, input: TenantPageLifecycleInput) {
  const row = await getVariantRow(db, variantId, input.scope)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const now = new Date().toISOString()
  await executeBatch(db, [
    documentConcurrencyGuard(document.id, input.expectedDocumentUpdatedAt),
    { query: 'UPDATE content_documents SET published_revision_id = NULL, updated_at = ? WHERE id = ? AND updated_at = ?', params: [now, document.id, input.expectedDocumentUpdatedAt] },
    { query: "UPDATE tenant_page_variants SET published_revision_id = NULL, status = 'draft', updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ?", params: [now, input.userId, variantId, input.scope.siteId, input.scope.organizationId] },
    { query: "UPDATE tenant_pages SET status = CASE WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'published') THEN 'published' WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'draft') THEN 'draft' ELSE 'archived' END, updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ?", params: [now, input.userId, row.page_id, input.scope.siteId, input.scope.organizationId] },
  ])
  return await getTenantPageForEditor(db, variantId, input.scope)
}

export async function archiveTenantPage(db: DbClient, variantId: string, input: TenantPageLifecycleInput & { replacementPath?: string | null; gone?: boolean }) {
  const row = await getVariantRow(db, variantId, input.scope)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const compliance = await queryFirst<{ privacy_page_id: string | null; terms_page_id: string | null; notice_page_id: string | null } | null>(db, `
    SELECT privacy_page_id, terms_page_id, notice_page_id FROM tenant_compliance
    WHERE site_id = ? AND organization_id = ? LIMIT 1
  `, [input.scope.siteId, input.scope.organizationId])
  const isReferencedLegalPage = Boolean(compliance && [compliance.privacy_page_id, compliance.terms_page_id, compliance.notice_page_id].includes(row.page_id))
  const replacementPath = input.replacementPath?.trim() ? normalizeTenantPagePath(input.replacementPath) : null
  if (isReferencedLegalPage && !replacementPath && input.gone !== true) conflict('Referenced legal pages require a replacement page or an explicit 410')
  let replacementPageId: string | null = null
  if (replacementPath) {
    const replacement = await queryFirst<{ page_id: string } | null>(db, `
      SELECT page_id FROM tenant_page_variants
      WHERE site_id = ? AND organization_id = ? AND locale = ? AND published_path = ?
        AND status = 'published' AND page_id <> ? AND published_revision_id IS NOT NULL
      LIMIT 1
    `, [input.scope.siteId, input.scope.organizationId, row.locale, replacementPath, row.page_id])
    if (!replacement) conflict('Archive replacement must be a published page for the same locale')
    replacementPageId = replacement.page_id
  }
  if (row.published_revision_id && (replacementPath || input.gone)) {
    await assertTenantPageRedirectLocaleSafe(db, {
      siteId: input.scope.siteId,
      locale: row.locale,
      fromPath: row.published_path,
      variantId,
    })
    await assertTenantPageRedirectWritable(db, {
      siteId: input.scope.siteId,
      organizationId: input.scope.organizationId,
      locale: row.locale,
      fromPath: row.published_path,
      variantId,
    })
  }
  const now = new Date().toISOString()
  await executeBatch(db, [
    documentConcurrencyGuard(document.id, input.expectedDocumentUpdatedAt),
    { query: 'UPDATE content_documents SET published_revision_id = NULL, updated_at = ? WHERE id = ? AND updated_at = ?', params: [now, document.id, input.expectedDocumentUpdatedAt] },
    { query: "UPDATE tenant_page_variants SET published_revision_id = NULL, status = 'archived', updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ?", params: [now, input.userId, variantId, input.scope.siteId, input.scope.organizationId] },
    { query: "UPDATE tenant_pages SET status = CASE WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'published') THEN 'published' WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'draft') THEN 'draft' ELSE 'archived' END, updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ?", params: [now, input.userId, row.page_id, input.scope.siteId, input.scope.organizationId] },
    ...(row.published_revision_id && (replacementPath || input.gone) ? [
      replacementPath
        ? { query: "INSERT INTO tenant_redirects (id, organization_id, site_id, locale, owner_variant_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 301, 'redirect', 'tenant_page_archive_replacement', 'tenant-pages', ?, ?) ON CONFLICT(site_id, locale, from_path) DO UPDATE SET owner_variant_id = excluded.owner_variant_id, to_path = excluded.to_path, status_code = excluded.status_code, behavior = excluded.behavior, reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at", params: [crypto.randomUUID(), input.scope.organizationId, input.scope.siteId, row.locale, variantId, row.published_path, replacementPath, now, now] }
        : { query: "INSERT INTO tenant_redirects (id, organization_id, site_id, locale, owner_variant_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 410, 'gone', 'tenant_page_archive_gone', 'tenant-pages', ?, ?) ON CONFLICT(site_id, locale, from_path) DO UPDATE SET owner_variant_id = excluded.owner_variant_id, to_path = NULL, status_code = 410, behavior = 'gone', reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at", params: [crypto.randomUUID(), input.scope.organizationId, input.scope.siteId, row.locale, variantId, row.published_path, now, now] },
    ] : []),
    ...(isReferencedLegalPage ? [{
      query: 'UPDATE tenant_compliance SET privacy_page_id = CASE WHEN privacy_page_id = ? THEN ? ELSE privacy_page_id END, terms_page_id = CASE WHEN terms_page_id = ? THEN ? ELSE terms_page_id END, notice_page_id = CASE WHEN notice_page_id = ? THEN ? ELSE notice_page_id END, updated_at = ? WHERE site_id = ? AND organization_id = ?',
      params: [row.page_id, replacementPageId, row.page_id, replacementPageId, row.page_id, replacementPageId, now, input.scope.siteId, input.scope.organizationId],
    }] : []),
  ])
  return await getTenantPageForEditor(db, variantId, input.scope)
}

export async function restoreTenantPage(db: DbClient, variantId: string, input: TenantPageLifecycleInput) {
  const row = await getVariantRow(db, variantId, input.scope)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const now = new Date().toISOString()
  await executeBatch(db, [
    documentConcurrencyGuard(document.id, input.expectedDocumentUpdatedAt),
    { query: "DELETE FROM tenant_redirects WHERE site_id = ? AND organization_id = ? AND locale = ? AND owner_variant_id = ? AND source = 'tenant-pages' AND reason IN ('tenant_page_archive_replacement', 'tenant_page_archive_gone')", params: [input.scope.siteId, input.scope.organizationId, row.locale, variantId] },
    { query: "UPDATE tenant_page_variants SET status = 'draft', updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ?", params: [now, input.userId, variantId, input.scope.siteId, input.scope.organizationId] },
    { query: "UPDATE tenant_pages SET status = CASE WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'published') THEN 'published' WHEN EXISTS (SELECT 1 FROM tenant_page_variants WHERE page_id = tenant_pages.id AND status = 'draft') THEN 'draft' ELSE 'archived' END, updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ?", params: [now, input.userId, row.page_id, input.scope.siteId, input.scope.organizationId] },
  ])
  return await getTenantPageForEditor(db, variantId, input.scope)
}

export async function deleteTenantPage(db: DbClient, variantId: string, input: { expectedDocumentUpdatedAt: string; scope: TenantPageScope }) {
  const row = await getVariantRow(db, variantId, input.scope)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  if (row.ever_published || row.status === 'published' || row.published_revision_id || document.published_revision_id) conflict('Pages with publication history must be archived or replaced before deletion')
  const variantCount = await queryFirst<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM tenant_page_variants WHERE page_id = ? AND site_id = ? AND organization_id = ?', [row.page_id, input.scope.siteId, input.scope.organizationId])
  const reference = await queryFirst<{ count: number }>(db, `
    SELECT (
      (SELECT COUNT(*) FROM tenant_compliance WHERE site_id = ? AND organization_id = ? AND (privacy_page_id = ? OR terms_page_id = ? OR notice_page_id = ?))
      + (SELECT COUNT(*) FROM tenant_navigation_items WHERE site_id = ? AND organization_id = ? AND url IN (?, ?))
      + (SELECT COUNT(*) FROM tenant_redirects WHERE site_id = ? AND organization_id = ? AND locale = ? AND (from_path = ? OR to_path = ?))
    ) AS count
  `, [input.scope.siteId, input.scope.organizationId, row.page_id, row.page_id, row.page_id, input.scope.siteId, input.scope.organizationId, row.draft_path, row.published_path, input.scope.siteId, input.scope.organizationId, row.locale, row.draft_path, row.published_path])
  if (Number(reference?.count ?? 0) > 0) conflict('Tenant page is still referenced by site configuration, navigation, or redirects')
  await executeBatch(db, [
    documentConcurrencyGuard(document.id, input.expectedDocumentUpdatedAt),
    { query: 'DELETE FROM content_documents WHERE id = ? AND owner_type = \'tenant_page\' AND owner_id = ?', params: [document.id, variantId] },
    { query: 'DELETE FROM tenant_page_variants WHERE id = ? AND site_id = ? AND organization_id = ?', params: [variantId, input.scope.siteId, input.scope.organizationId] },
    ...(Number(variantCount?.count ?? 0) <= 1 ? [{ query: 'DELETE FROM tenant_pages WHERE id = ? AND site_id = ? AND organization_id = ?', params: [row.page_id, input.scope.siteId, input.scope.organizationId] }] : []),
  ])
  return { deleted: true as const, id: variantId }
}

export async function listPublishedTenantPagePaths(db: DbClient, siteId: string, locale?: string | null) {
  const resolvedLocale = await resolveLocale(db, siteId, locale)
  return await queryAll<{ path: string; updated_at: string; robots: string | null }>(db, "SELECT published_path AS path, updated_at, robots FROM tenant_page_variants WHERE site_id = ? AND locale = ? AND status = 'published' AND published_revision_id IS NOT NULL ORDER BY published_path ASC", [siteId, resolvedLocale])
}

export async function getTenantPageById(db: DbClient, variantId: string, scope?: TenantPageScope) {
  return await getTenantPageForEditor(db, variantId, scope)
}

export async function getTenantPageForEditorByPath(db: DbClient, siteId: string, path: string, locale?: string | null) {
  const resolvedLocale = await resolveLocale(db, siteId, locale)
  const row = await queryFirst<{ id: string } | null>(db, `
    SELECT id FROM tenant_page_variants
     WHERE site_id = ? AND locale = ? AND (published_path = ? OR draft_path = ?)
     LIMIT 1
  `, [siteId, resolvedLocale, normalizeTenantPagePath(path), normalizeTenantPagePath(path)])
  if (!row) notFound('Tenant page variant not found')
  return await getTenantPageForEditor(db, row.id)
}
