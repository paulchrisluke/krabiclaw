import { createError } from 'h3'
import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import {
  createContentDocumentWithBlocks,
  getContentDocumentById,
  getContentDocumentByOwner,
  getContentEditorSnapshot,
  getPublishedContentSnapshot,
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

async function assertTenantPageSupport(db: DbClient, siteId: string, input: TenantPageEditorInput, blocks: TenantPageBlock[]) {
  const pageType = input.pageType ?? 'custom'
  if (pageType === 'custom' && !(await hasSiteEntitlement(db, siteId, 'custom_pages'))) {
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
  }
}

function blocksAsInputs(blocks: TenantPageBlock[]): ContentBlockInput[] {
  return blocks.map(block => ({ id: block.id, type: block.type, position: block.position, data: block.data }))
}

function isReservedPath(path: string): boolean {
  return RESERVED_EXACT_PATHS.has(path) || RESERVED_PREFIXES.some(prefix => path.startsWith(prefix))
}

async function getVariantRow(db: DbClient, variantId: string): Promise<TenantPageVariantRow | null> {
  return await queryFirst<TenantPageVariantRow | null>(db, [
    'SELECT v.id AS variant_id, v.page_id, v.organization_id, v.site_id, v.locale, v.published_path, v.draft_path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url, v.robots,',
    '       p.page_type, p.recipe, p.sort_order, v.status, v.draft_document_id, v.published_revision_id, v.updated_at',
    '  FROM tenant_page_variants v JOIN tenant_pages p ON p.id = v.page_id',
    ' WHERE v.id = ? LIMIT 1',
  ].join('\n'), [variantId])
}

async function resolveLocale(db: DbClient, siteId: string, locale?: string | null): Promise<string> {
  if (locale?.trim()) {
    const row = await queryFirst<{ locale: string } | null>(
      db,
      "SELECT locale FROM site_locales WHERE site_id = ? AND locale = ? AND status IN ('active', 'published') LIMIT 1",
      [siteId, locale.trim()],
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
  input: { siteId: string; locale: string; path: string; excludeVariantId?: string | null; allowSystemPath?: boolean },
) {
  const path = normalizeTenantPagePath(input.path)
  if (isReservedPath(path) && !input.allowSystemPath) conflict('This path is reserved by a platform or product route')
  const row = await queryFirst<{ id: string } | null>(db, [
    'SELECT id FROM tenant_page_variants',
    'WHERE site_id = ? AND locale = ? AND (published_path = ? OR draft_path = ?)',
    '  AND (? IS NULL OR id <> ?) LIMIT 1',
  ].join('\n'), [input.siteId, input.locale, path, path, input.excludeVariantId ?? null, input.excludeVariantId ?? null])
  if (row) conflict('A tenant page already uses this path for the selected locale')
  return path
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
    '       p.page_type, p.recipe, p.sort_order, v.status, v.draft_document_id, v.published_revision_id, v.updated_at',
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

export async function getTenantPageForEditor(db: DbClient, variantId: string): Promise<TenantPageDto> {
  const row = await getVariantRow(db, variantId)
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
  const row = await queryFirst<TenantPageVariantRow | null>(db, [
    'SELECT v.id AS variant_id, v.page_id, v.organization_id, v.site_id, v.locale, v.published_path, v.draft_path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url, v.robots,',
    '       p.page_type, p.recipe, p.sort_order, v.status, v.draft_document_id, v.published_revision_id, v.updated_at',
    '  FROM tenant_page_variants v JOIN tenant_pages p ON p.id = v.page_id',
    " WHERE v.site_id = ? AND v.locale = ? AND v.published_path = ? AND v.status = 'published'",
    '   AND v.published_revision_id IS NOT NULL LIMIT 1',
  ].join('\n'), [siteId, resolvedLocale, normalizedPath])
  if (!row || !row.draft_document_id) return null
  const document = await getContentDocumentByOwner(db, 'tenant_page', row.variant_id)
  const blocks = await getPublishedContentSnapshot(db, 'tenant_page', row.variant_id)
  if (!document || !blocks) throw createError({ statusCode: 500, statusMessage: 'Published tenant page content is unavailable' })
  return pageDto(row, document, blocks as TenantPageBlock[])
}

export async function createTenantPage(db: DbClient, input: { organizationId: string; siteId: string; userId: string | null; data: TenantPageEditorInput }) {
  const locale = await resolveLocale(db, input.siteId, input.data.locale)
  const path = await assertTenantPagePathAvailable(db, { siteId: input.siteId, locale, path: input.data.path, allowSystemPath: input.data.pageType === 'system' })
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
    query: "INSERT INTO tenant_page_variants (id, organization_id, site_id, page_id, locale, draft_document_id, published_path, draft_path, title, summary, seo_title, seo_description, canonical_url, robots, status, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    params: [variantId, input.organizationId, input.siteId, pageId, locale, documentId, path, path, metadata.title, metadata.summary, metadata.seoTitle, metadata.seoDescription, metadata.canonicalUrl, metadata.robots, pageStatus, now, now, input.userId],
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

/**
 * Create the draft variant used by translation workflows without publishing
 * untranslated content. The page identity and route remain shared with the
 * source variant; only the locale-specific document is new.
 */
export async function ensureTenantPageVariant(
  db: DbClient,
  pageId: string,
  locale: string,
  userId: string | null,
): Promise<TenantPageDto> {
  const targetLocale = await queryFirst<{ locale: string } | null>(db, `
    SELECT locale
    FROM site_locales sl
    JOIN tenant_pages p ON p.site_id = sl.site_id
    WHERE p.id = ? AND sl.locale = ? AND sl.status IN ('active', 'published')
    LIMIT 1
  `, [pageId, locale.trim()])
  if (!targetLocale) notFound('Locale is not configured for this tenant page')

  const existing = await queryFirst<{ id: string } | null>(db, `
    SELECT id FROM tenant_page_variants WHERE page_id = ? AND locale = ? LIMIT 1
  `, [pageId, targetLocale.locale])
  if (existing) return await getTenantPageForEditor(db, existing.id)

  const source = await queryFirst<{ id: string } | null>(db, `
    SELECT v.id
    FROM tenant_page_variants v
    JOIN site_locales sl ON sl.site_id = v.site_id AND sl.locale = v.locale AND sl.is_source = 1
    WHERE v.page_id = ?
    ORDER BY CASE WHEN v.published_revision_id IS NOT NULL THEN 0 ELSE 1 END, v.updated_at DESC
    LIMIT 1
  `, [pageId])
  if (!source) throw createError({ statusCode: 500, statusMessage: 'Tenant page source variant is unavailable' })

  const sourcePage = await getTenantPageForEditor(db, source.id)
  const path = await assertTenantPagePathAvailable(db, {
    siteId: sourcePage.site_id,
    locale: targetLocale.locale,
    path: sourcePage.path,
    excludeVariantId: null,
    allowSystemPath: sourcePage.page_type === 'system',
  })
  const variantId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const revisionId = crypto.randomUUID()
  const now = new Date().toISOString()
  const metadata = metadataForInput({
    locale: targetLocale.locale,
    path,
    title: sourcePage.title,
    summary: sourcePage.summary,
    seoTitle: sourcePage.seo_title,
    seoDescription: sourcePage.seo_description,
    canonicalUrl: sourcePage.canonical_url,
    robots: sourcePage.robots,
    pageType: sourcePage.page_type,
    recipe: sourcePage.recipe,
    blocks: sourcePage.blocks,
  }, targetLocale.locale, path)
  const result = await createContentDocumentWithBlocks(
    db,
    'tenant_page',
    variantId,
    blocksAsInputs(sourcePage.blocks),
    {
      documentId,
      revisionId,
      snapshotMetadata: metadata as unknown as Record<string, unknown>,
      createdBy: userId,
      label: 'Translated tenant page draft',
      publish: false,
      additionalQueriesBefore: [{
        query: `
          INSERT INTO tenant_page_variants
            (id, organization_id, site_id, page_id, locale, draft_document_id,
             published_path, draft_path, title, summary, seo_title, seo_description,
             canonical_url, robots, status, created_at, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
        `,
        params: [
          variantId,
          sourcePage.organization_id,
          sourcePage.site_id,
          pageId,
          targetLocale.locale,
          documentId,
          path,
          path,
          metadata.title,
          metadata.summary,
          metadata.seoTitle,
          metadata.seoDescription,
          metadata.canonicalUrl,
          metadata.robots,
          now,
          now,
          userId,
        ],
      }],
      additionalQueriesAfter: [{
        query: 'UPDATE tenant_page_variants SET published_revision_id = NULL WHERE id = ?',
        params: [variantId],
      }],
    },
  )
  void result
  return await getTenantPageForEditor(db, variantId)
}

export async function updateTenantPageDraft(db: DbClient, variantId: string, input: { userId: string | null; data: TenantPageEditorInput }) {
  const row = await getVariantRow(db, variantId)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (!input.data.expectedDocumentUpdatedAt || document.updated_at !== input.data.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const path = await assertTenantPagePathAvailable(db, { siteId: row.site_id, locale: row.locale, path: input.data.path, excludeVariantId: variantId, allowSystemPath: input.data.pageType === 'system' })
  const metadata = metadataForInput(input.data, row.locale, path)
  const blocks = normalizeTenantPageBlocks(input.data.blocks)
  await assertTenantPageSupport(db, row.site_id, input.data, blocks)
  const revisionId = crypto.randomUUID()
  const now = new Date().toISOString()
  const pageStatus: TenantPageStatus = row.published_revision_id ? 'published' : 'draft'
  const updateVariant: BatchQuery = {
    query: 'UPDATE tenant_page_variants SET draft_path = ?, title = ?, summary = ?, seo_title = ?, seo_description = ?, canonical_url = ?, robots = ?, status = ?, updated_at = ?, updated_by = ? WHERE id = ?',
    params: [path, metadata.title, metadata.summary, metadata.seoTitle, metadata.seoDescription, metadata.canonicalUrl, metadata.robots, pageStatus, now, input.userId, variantId],
  }
  const updatePage: BatchQuery = {
    query: 'UPDATE tenant_pages SET title = ?, page_type = ?, recipe = ?, summary = ?, status = ?, sort_order = COALESCE(?, sort_order), updated_at = ?, updated_by = ? WHERE id = ?',
    params: [metadata.title, metadata.pageType, metadata.recipe, metadata.summary, pageStatus, input.data.sortOrder ?? null, now, input.userId, row.page_id],
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
  return { page: await getTenantPageForEditor(db, variantId), revision_id: result.revision_id }
}

export async function publishTenantPage(db: DbClient, variantId: string, input: { userId: string; expectedDocumentUpdatedAt: string }) {
  const row = await getVariantRow(db, variantId)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document?.draft_revision_id) badRequest('Tenant page has no draft revision')
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const revision = await queryFirst<{ snapshot_json: string } | null>(db, 'SELECT snapshot_json FROM content_revisions WHERE id = ? AND document_id = ? LIMIT 1', [document.draft_revision_id, document.id])
  if (!revision) throw createError({ statusCode: 500, statusMessage: 'Tenant page draft revision is unavailable' })
  parseSnapshot(revision.snapshot_json)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: 'UPDATE content_documents SET published_revision_id = ?, updated_at = ? WHERE id = ? AND updated_at = ?', params: [document.draft_revision_id, now, document.id, input.expectedDocumentUpdatedAt] },
    { query: "UPDATE tenant_page_variants SET published_revision_id = ?, published_path = draft_path, status = 'published', updated_at = ?, updated_by = ? WHERE id = ?", params: [document.draft_revision_id, now, input.userId, variantId] },
    { query: "UPDATE tenant_pages SET path = CASE WHEN EXISTS (SELECT 1 FROM site_locales sl WHERE sl.site_id = tenant_pages.site_id AND sl.locale = (SELECT locale FROM tenant_page_variants WHERE id = ?) AND sl.is_source = 1) THEN (SELECT draft_path FROM tenant_page_variants WHERE id = ?) ELSE path END, status = 'published', updated_at = ?, updated_by = ? WHERE id = ?", params: [variantId, variantId, now, input.userId, row.page_id] },
    ...(row.published_path !== row.draft_path ? [
      { query: "INSERT INTO tenant_redirects (id, organization_id, site_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 301, 'redirect', 'tenant_page_path_change', 'tenant-pages', ?, ?) ON CONFLICT(site_id, from_path) DO UPDATE SET to_path = excluded.to_path, status_code = excluded.status_code, behavior = excluded.behavior, reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at", params: [crypto.randomUUID(), row.organization_id, row.site_id, row.published_path, row.draft_path, now, now] },
      { query: "UPDATE tenant_navigation_items SET url = ?, updated_at = ?, updated_by = ? WHERE site_id = ? AND item_type = 'internal' AND url = ?", params: [row.draft_path, now, input.userId, row.site_id, row.published_path] },
    ] : []),
  ])
  return await getTenantPageForEditor(db, variantId)
}

export async function unpublishTenantPage(db: DbClient, variantId: string, input: { userId: string; expectedDocumentUpdatedAt: string }) {
  const row = await getVariantRow(db, variantId)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: 'UPDATE content_documents SET published_revision_id = NULL, updated_at = ? WHERE id = ? AND updated_at = ?', params: [now, document.id, input.expectedDocumentUpdatedAt] },
    { query: "UPDATE tenant_page_variants SET published_revision_id = NULL, status = 'draft', updated_at = ?, updated_by = ? WHERE id = ?", params: [now, input.userId, variantId] },
    { query: "UPDATE tenant_pages SET status = 'draft', updated_at = ?, updated_by = ? WHERE id = ?", params: [now, input.userId, row.page_id] },
  ])
  return await getTenantPageForEditor(db, variantId)
}

export async function archiveTenantPage(db: DbClient, variantId: string, input: { userId: string; expectedDocumentUpdatedAt: string }) {
  const row = await getVariantRow(db, variantId)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: 'UPDATE content_documents SET published_revision_id = NULL, updated_at = ? WHERE id = ? AND updated_at = ?', params: [now, document.id, input.expectedDocumentUpdatedAt] },
    { query: "UPDATE tenant_page_variants SET published_revision_id = NULL, status = 'archived', updated_at = ?, updated_by = ? WHERE id = ?", params: [now, input.userId, variantId] },
    { query: "UPDATE tenant_pages SET status = 'archived', updated_at = ?, updated_by = ? WHERE id = ?", params: [now, input.userId, row.page_id] },
  ])
  return await getTenantPageForEditor(db, variantId)
}

export async function restoreTenantPage(db: DbClient, variantId: string, input: { userId: string; expectedDocumentUpdatedAt: string }) {
  const row = await getVariantRow(db, variantId)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: "UPDATE tenant_page_variants SET status = 'draft', updated_at = ?, updated_by = ? WHERE id = ?", params: [now, input.userId, variantId] },
    { query: "UPDATE tenant_pages SET status = 'draft', updated_at = ?, updated_by = ? WHERE id = ?", params: [now, input.userId, row.page_id] },
  ])
  return await getTenantPageForEditor(db, variantId)
}

export async function deleteTenantPage(db: DbClient, variantId: string, input: { expectedDocumentUpdatedAt: string }) {
  const row = await getVariantRow(db, variantId)
  if (!row) notFound('Tenant page variant not found')
  if (!row.draft_document_id) throw createError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.draft_document_id)
  if (!document) throw createError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (document.updated_at !== input.expectedDocumentUpdatedAt) conflict('Tenant page draft was updated by another writer')
  const variantCount = await queryFirst<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM tenant_page_variants WHERE page_id = ?', [row.page_id])
  await executeBatch(db, [
    { query: 'DELETE FROM content_documents WHERE id = ?', params: [document.id] },
    { query: 'DELETE FROM tenant_page_variants WHERE id = ?', params: [variantId] },
    ...(Number(variantCount?.count ?? 0) <= 1 ? [{ query: 'DELETE FROM tenant_pages WHERE id = ?', params: [row.page_id] }] : []),
  ])
  return { deleted: true as const, id: variantId }
}

export async function listPublishedTenantPagePaths(db: DbClient, siteId: string, locale?: string | null) {
  const resolvedLocale = await resolveLocale(db, siteId, locale)
  return await queryAll<{ path: string; updated_at: string; robots: string | null }>(db, "SELECT published_path AS path, updated_at, robots FROM tenant_page_variants WHERE site_id = ? AND locale = ? AND status = 'published' AND published_revision_id IS NOT NULL ORDER BY published_path ASC", [siteId, resolvedLocale])
}

export async function getTenantPageById(db: DbClient, variantId: string) {
  return await getTenantPageForEditor(db, variantId)
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
