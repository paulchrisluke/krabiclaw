import { HTTPError } from 'nitro';
import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import {
  createContentDocumentWithBlocks,
  getContentDocumentById,
  getContentDocumentByOwner,
  getContentEditorSnapshot,
  getContentEditorSnapshotForDocument,
  prepareContentDocumentBlocksReplacement,
  prepareContentDocumentWithBlocks,
  replaceContentDocumentBlocks,
  type ContentBlockInput,
} from '~/server/utils/content-documents'
import {
  normalizeTenantPageBlocks,
  normalizeTenantPagePath,
  blockDefinition,
  TENANT_PAGE_RECIPE_REGISTRY,
  TENANT_PAGE_TYPES,
  type TenantPageBlock,
  type TenantPageSnapshotMetadata,
  type TenantPageType,
} from '~/utils/tenant-page-blocks'
import { hasSiteEntitlement } from '~/server/utils/billing'
import type { CloudflareEnv } from '~/server/utils/auth'
import { refreshSocialCard } from '~/server/utils/social-card'
import { normalizeDomain } from '~/server/utils/domain-shared'
import { assertExactCanonicalLocale } from '~/server/utils/localization'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
import { buildSingleMediaPlacementQueries, insertInitialMediaPlacements, hydrateMediaAssetRefs } from '~/server/utils/media-asset-manager'
import { isSingleMediaPlacement } from '~/shared/media-placement-contract'
import { getMediaPlacements } from '~/server/utils/media-placement'

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
  expectedDocumentUpdatedAt?: string | null
}

export interface TenantPageDocument {
  id: string
  updated_at: string
}

export interface TenantPageDto {
  id: string
  page_id: string
  site_id: string
  organization_id: string
  locale: string
  path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  page_type: TenantPageType
  recipe: string | null
  sort_order: number
  blocks: TenantPageBlock[]
  document: TenantPageDocument
  updated_at: string
}

interface TenantPageVariantRow {
  variant_id: string
  page_id: string
  organization_id: string
  site_id: string
  locale: string
  path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  page_type: TenantPageType
  recipe: string | null
  sort_order: number
  document_id: string | null
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
  throw new HTTPError({ statusCode: 400, statusMessage: message })
}

function notFound(message: string): never {
  throw new HTTPError({ statusCode: 404, statusMessage: message })
}

function conflict(message: string): never {
  throw new HTTPError({ statusCode: 409, statusMessage: message })
}

function asString(value: unknown, field: string, required = false): string | null {
  if (value == null || value === '') {
    if (required) badRequest(field + ' is required')
    return null
  }
  if (typeof value !== 'string') badRequest(field + ' must be a string')
  return value.trim()
}

function metadataForInput(input: TenantPageEditorInput, locale: string, path: string): TenantPageSnapshotMetadata {
  const pageType = input.pageType ?? 'custom'
  if (!TENANT_PAGE_TYPES.includes(pageType)) badRequest('pageType is invalid')
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

async function assertTenantPageSupport(db: DbClient, organizationId: string, siteId: string, input: TenantPageEditorInput, blocks: TenantPageBlock[], options: { checkCustomPageEntitlement?: boolean } = {}) {
  const pageType = input.pageType ?? 'custom'
  if (!TENANT_PAGE_TYPES.includes(pageType)) badRequest('pageType is invalid')
  if (pageType === 'custom' && options.checkCustomPageEntitlement !== false && !(await hasSiteEntitlement(db, siteId, 'custom_pages'))) {
    throw new HTTPError({ statusCode: 402, statusMessage: 'Custom tenant pages require the Growth plan or higher' })
  }
  const recipe = input.recipe?.trim() || null
  if (pageType === 'recipe' && !recipe) badRequest('recipe is required for recipe pages')
  if (recipe && !TENANT_PAGE_RECIPE_REGISTRY.has(recipe)) badRequest(`Recipe "${recipe}" is not supported`)
  if (recipe) {
    for (const block of blocks) {
      const definition = blockDefinition(block.type)
      if (!definition.allowedPageTypes.includes(pageType)) {
        badRequest(`Block type "${block.type}" is not supported by page type "${pageType}"`)
      }
      if (!definition.allowedRecipes.includes(recipe)) {
        badRequest(`Block type "${block.type}" is not supported by recipe "${recipe}"`)
      }
    }
  } else {
    for (const block of blocks) {
      if (!blockDefinition(block.type).allowedPageTypes.includes(pageType)) {
        badRequest(`Block type "${block.type}" is not supported by page type "${pageType}"`)
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

async function tenantPagePlacementQueries(
  db: DbClient,
  organizationId: string,
  siteId: string,
  blocks: TenantPageBlock[],
  now?: string,
): Promise<BatchQuery[]> {
  if (!blocks.length) return []
  const queries: BatchQuery[] = []
  const existingRows = await queryAll<{ id: string }>(db, `
    SELECT id FROM content_blocks WHERE id IN (SELECT value FROM json_each(?))
  `, [d1JsonStringSet(blocks.map(block => block.id))])
  const existingBlockIds = new Set(existingRows.map(row => row.id))
  const existingPlacements = await getMediaPlacements(db, {
    siteId,
    ownerType: 'content_block',
    ownerIds: blocks.map(block => block.id),
  })
  for (const block of blocks) {
    const bySlot = new Map<string, typeof block.media>()
    for (const item of block.media) {
      const slotMedia = bySlot.get(item.slot) ?? []
      slotMedia.push(item)
      bySlot.set(item.slot, slotMedia)
    }
    if (existingBlockIds.has(block.id)) {
      const currentBySlot = new Map<string, string[]>()
      for (const item of existingPlacements.get(block.id) ?? []) {
        const ids = currentBySlot.get(item.slot) ?? []
        ids.push(item.asset_id)
        currentBySlot.set(item.slot, ids)
      }
      const slots = new Set([...currentBySlot.keys(), ...bySlot.keys()])
      for (const slot of slots) {
        const current = currentBySlot.get(slot) ?? []
        const requested = (bySlot.get(slot) ?? []).map(item => item.asset_id)
        if (current.length === requested.length && current.every((assetId, index) => assetId === requested[index])) continue
        if (!isSingleMediaPlacement({ owner_type: 'content_block', slot })) {
          badRequest(`blocks.${block.id}.media cannot replace an existing gallery; use attach/remove/reorder media operations`)
        }
        const media = await hydrateMediaAssetRefs(db, {
          organizationId,
          siteId,
          refs: (bySlot.get(slot) ?? []).map(item => ({ asset_id: item.asset_id })),
          allowedKinds: ['image', 'video'],
          fieldName: `blocks.${block.id}.media`,
        })
        queries.push(...buildSingleMediaPlacementQueries({
          organizationId,
          siteId,
          placement: { owner_type: 'content_block', owner_id: block.id, slot },
          media,
          now,
        }))
      }
      continue
    }
    const canonicalSlot = block.type === 'gallery' ? 'gallery' : ['hero', 'image'].includes(block.type) ? 'media' : null
    const slots = new Set([...bySlot.keys(), ...(canonicalSlot ? [canonicalSlot] : [])])
    for (const slot of slots) {
      const items = bySlot.get(slot) ?? []
      const media = await hydrateMediaAssetRefs(db, {
        organizationId,
        siteId,
        refs: items.map(item => ({ asset_id: item.asset_id })),
        allowedKinds: ['image', 'video'],
        fieldName: `blocks.${block.id}.media`,
      })
      queries.push(...insertInitialMediaPlacements({
        organizationId,
        siteId,
        placement: { owner_type: 'content_block', owner_id: block.id, slot },
        media,
        now,
      }))
    }
  }
  return queries
}

export function preserveOmittedBlockMedia(value: unknown, existingBlocks: TenantPageBlock[]): unknown {
  if (!Array.isArray(value)) return value
  const existingById = new Map(existingBlocks.map(block => [block.id, block.media]))
  return value.map((rawBlock) => {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return rawBlock
    if (Object.prototype.hasOwnProperty.call(rawBlock, 'media')) return rawBlock
    const id = 'id' in rawBlock && typeof rawBlock.id === 'string' ? rawBlock.id : null
    return id && existingById.has(id)
      ? { ...rawBlock, media: existingById.get(id) }
      : rawBlock
  })
}

async function attachTenantPageMedia(db: DbClient, siteId: string, blocks: TenantPageBlock[]): Promise<TenantPageBlock[]> {
  const placements = await getMediaPlacements(db, { siteId, ownerType: 'content_block', ownerIds: blocks.map(block => block.id) })
  return blocks.map(block => ({
    ...block,
    media: (placements.get(block.id) ?? []).map(item => ({
      asset_id: item.asset_id,
      slot: item.slot,
      sort_order: item.sort_order,
      public_url: item.public_url,
      thumbnail_url: item.thumbnail_url,
      kind: item.kind,
      alt_text: item.alt_text,
    })),
  }))
}

function isReservedPath(path: string): boolean {
  return RESERVED_EXACT_PATHS.has(path) || RESERVED_PREFIXES.some(prefix => path.startsWith(prefix))
}

export interface TenantPageScope {
  siteId: string
  organizationId: string
}

async function getVariantRow(db: DbClient, variantId: string, scope?: TenantPageScope): Promise<TenantPageVariantRow | null> {
  return await queryFirst<TenantPageVariantRow | null>(db, [
    'SELECT v.id AS variant_id, v.page_id, v.organization_id, v.site_id, v.locale, v.path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url, v.robots,',
    '       p.page_type, p.recipe, p.sort_order, v.document_id, v.updated_at',
    '  FROM tenant_page_variants v JOIN tenant_pages p ON p.id = v.page_id',
    ' WHERE v.id = ? AND (? IS NULL OR v.site_id = ?) AND (? IS NULL OR v.organization_id = ?) LIMIT 1',
  ].join('\n'), [variantId, scope?.siteId ?? null, scope?.siteId ?? null, scope?.organizationId ?? null, scope?.organizationId ?? null])
}

async function resolveLocale(db: DbClient, siteId: string, locale?: string | null): Promise<string> {
  if (locale?.trim()) {
    const exactLocale = assertExactCanonicalLocale(locale)
    const row = await queryFirst<{ locale: string } | null>(
      db,
      'SELECT locale FROM site_locales WHERE site_id = ? AND locale = ? AND status = \'published\' LIMIT 1',
      [siteId, exactLocale],
    )
    if (!row) notFound('Locale is not configured for this site')
    return row.locale
  }
  const row = await queryFirst<{ locale: string | null }>(
    db,
    'SELECT locale FROM site_locales WHERE site_id = ? AND locale = \'en\' AND is_source = 1 AND status = \'published\' LIMIT 1',
    [siteId],
  )
  if (!row?.locale) throw new HTTPError({ statusCode: 500, statusMessage: 'Source locale is not configured for this site' })
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
    'WHERE site_id = ? AND locale = ? AND path = ?',
    '  AND (? IS NULL OR id <> ?) LIMIT 1',
  ].join('\n'), [input.siteId, input.locale, path, input.excludeVariantId ?? null, input.excludeVariantId ?? null])
  if (row) conflict('A tenant page already uses this path for the selected locale')
  const redirect = await queryFirst<{ id: string } | null>(db, `
    SELECT id FROM site_redirects
     WHERE site_id = ? AND locale = ? AND from_path = ?
       AND (? IS NULL OR owner_id IS NULL OR owner_id <> ?)
     LIMIT 1
  `, [input.siteId, input.locale, path, input.allowOwnedRedirectVariantId ?? null, input.allowOwnedRedirectVariantId ?? null])
  if (redirect) conflict('A tenant redirect already owns this path')
  return path
}

async function assertTenantPageRedirectWritable(
  db: DbClient,
  input: { siteId: string; organizationId: string; locale: string; fromPath: string; variantId: string },
) {
  const existing = await queryFirst<{ owner_id: string | null; source: string } | null>(db, `
    SELECT owner_id, source
      FROM site_redirects
     WHERE site_id = ? AND organization_id = ? AND locale = ? AND from_path = ?
     LIMIT 1
  `, [input.siteId, input.organizationId, input.locale, input.fromPath])
  if (existing && (existing.owner_id !== input.variantId || existing.source !== 'tenant-pages')) {
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
     WHERE site_id = ? AND locale = ? AND path = ?
         AND id <> ?
     LIMIT 1
  `, [input.siteId, input.locale, input.fromPath, input.variantId])
  if (owner) conflict('A locale-specific redirect cannot replace a path still published by another locale')
}

async function prepareTenantPageRedirectFlatten(
  db: DbClient,
  input: {
    siteId: string
    organizationId: string
    locale: string
    fromPath: string
    toPath: string | null
  },
  now: string,
): Promise<BatchQuery[]> {
  const incoming = await queryAll<{ from_path: string; source: string; behavior: string }>(db, `
    SELECT from_path, source, behavior
      FROM site_redirects
     WHERE site_id = ? AND organization_id = ? AND locale = ? AND to_path = ?
       AND behavior = 'redirect'
  `, [input.siteId, input.organizationId, input.locale, input.fromPath])
  if (!input.toPath) {
    if (incoming.length) conflict('Cannot archive a page while another redirect points to it')
    return []
  }
  if (incoming.some(redirect => redirect.from_path === input.toPath)) {
    conflict('Changing this page path would create a redirect cycle')
  }
  if (incoming.some(redirect => redirect.source !== 'tenant-pages')) {
    conflict('A manual tenant redirect points to this page and cannot be rewritten automatically')
  }
  if (!incoming.length) return []
  return [{
    query: `UPDATE site_redirects
       SET to_path = ?, updated_at = ?
     WHERE site_id = ? AND organization_id = ? AND locale = ? AND to_path = ? AND behavior = 'redirect'`,
    params: [input.toPath, now, input.siteId, input.organizationId, input.locale, input.fromPath],
  }]
}

async function canonicalTenantPageIdentity(
  db: DbClient,
  row: Pick<TenantPageVariantRow, 'site_id' | 'locale' | 'page_type' | 'recipe'>,
  input: { pageType?: TenantPageType | null; recipe?: string | null },
): Promise<{ pageType: TenantPageType; recipe: string | null }> {
  const source = await queryFirst<{ is_source: number } | null>(db, `
    SELECT is_source FROM site_locales WHERE site_id = ? AND locale = ? LIMIT 1
  `, [row.site_id, row.locale])
  const pageType = input.pageType ?? row.page_type
  const recipe = input.recipe === undefined ? row.recipe : (input.recipe?.trim() || null)
  if (!source?.is_source && (pageType !== row.page_type || recipe !== row.recipe)) {
    badRequest('A translated tenant-page variant must use the source page identity')
  }
  return {
    pageType: source?.is_source ? pageType : row.page_type,
    recipe: source?.is_source ? recipe : row.recipe,
  }
}

function pageDto(row: TenantPageVariantRow, document: TenantPageDocument, blocks: TenantPageBlock[]): TenantPageDto {
  return {
    id: row.variant_id,
    page_id: row.page_id,
    site_id: row.site_id,
    organization_id: row.organization_id,
    locale: row.locale,
    path: row.path,
    title: row.title,
    summary: row.summary,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    canonical_url: row.canonical_url,
    robots: row.robots,
    page_type: row.page_type,
    recipe: row.recipe,
    sort_order: row.sort_order,
    blocks,
    document,
    updated_at: row.updated_at,
  }
}

export async function listTenantPages(db: DbClient, siteId: string, opts: { locale?: string | null } = {}) {
  const locale = await resolveLocale(db, siteId, opts.locale)
  const rows = await queryAll<TenantPageVariantRow>(db, [
    'SELECT v.id AS variant_id, v.page_id, v.organization_id, v.site_id, v.locale, v.path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url, v.robots,',
    '       p.page_type, p.recipe, p.sort_order, v.document_id, v.updated_at',
    '  FROM tenant_page_variants v JOIN tenant_pages p ON p.id = v.page_id',
    ' WHERE v.site_id = ? AND v.locale = ? ORDER BY p.sort_order ASC, v.title ASC',
  ].join('\n'), [siteId, locale])
  return rows.map(row => ({
    id: row.variant_id,
    page_id: row.page_id,
    locale: row.locale,
    path: row.path,
    title: row.title,
    page_type: row.page_type,
    recipe: row.recipe,
    sort_order: row.sort_order,
    updated_at: row.updated_at,
  }))
}

export async function getTenantPageForEditor(db: DbClient, variantId: string, scope?: TenantPageScope): Promise<TenantPageDto> {
  const row = await getVariantRow(db, variantId, scope)
  if (!row) notFound('Tenant page variant not found')
  if (!row.document_id) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.document_id)
  if (!document) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  const snapshot = await getContentEditorSnapshot(db, 'tenant_page', variantId)
  const blocks = await attachTenantPageMedia(db, row.site_id, (snapshot?.blocks ?? []).map(block => ({ ...block, media: [] })) as TenantPageBlock[])
  return pageDto(row, document, blocks)
}

export async function getPublishedTenantPage(db: DbClient, siteId: string, path: string, locale?: string | null): Promise<TenantPageDto | null> {
  const resolvedLocale = await resolveLocale(db, siteId, locale)
  const normalizedPath = normalizeTenantPagePath(path)
  const selectPublished = async (candidateLocale: string) => await queryFirst<TenantPageVariantRow | null>(db, [
    'SELECT v.id AS variant_id, v.page_id, v.organization_id, v.site_id, v.locale, v.path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url, v.robots,',
    '       p.page_type, p.recipe, p.sort_order, v.document_id, v.updated_at',
    '  FROM tenant_page_variants v JOIN tenant_pages p ON p.id = v.page_id',
    " WHERE v.site_id = ? AND v.locale = ? AND v.path = ? LIMIT 1",
  ].join('\n'), [siteId, candidateLocale, normalizedPath])
  const row = await selectPublished(resolvedLocale)
  if (!row) return null
  if (!row.document_id) return null
  const document = await getContentDocumentByOwner(db, 'tenant_page', row.variant_id)
  if (!document) throw new HTTPError({ statusCode: 500, statusMessage: 'Published tenant page content is unavailable' })
  const snapshot = await getContentEditorSnapshotForDocument(db, document)
  if (!snapshot) throw new HTTPError({ statusCode: 500, statusMessage: 'Published tenant page content is unavailable' })
  const blocks = await attachTenantPageMedia(db, siteId, snapshot.blocks.map(block => ({ ...block, media: [] })) as TenantPageBlock[])
  return pageDto(row, document, blocks)
}

export async function resolvePublishedTenantPageIdentity(
  db: DbClient,
  siteId: string,
  path: string,
  locale?: string | null,
) {
  const resolvedLocale = await resolveLocale(db, siteId, locale)
  const normalizedPath = normalizeTenantPagePath(path)
  const selectPublished = async (candidateLocale: string) => await queryFirst<{
    page_id: string
    page_type: TenantPageType
    recipe: string | null
    locale: string
  } | null>(db, `
    SELECT p.id AS page_id, p.page_type, p.recipe, v.locale
      FROM tenant_page_variants v
      JOIN tenant_pages p ON p.id = v.page_id
     WHERE v.site_id = ? AND v.locale = ? AND v.path = ?
      LIMIT 1
  `, [siteId, candidateLocale, normalizedPath])
  const page = await selectPublished(resolvedLocale)
  return page
}

export async function createTenantPagesBatch(
  db: DbClient,
  input: {
    organizationId: string
    siteId: string
    userId?: string | null
    pages: Array<{
      data: TenantPageEditorInput
      trustedSystemPage?: boolean
    }>
  },
) {
  const locale = await resolveLocale(db, input.siteId, 'en')
  const localeRow = await queryFirst<{ is_source: number } | null>(db, `
    SELECT is_source FROM site_locales WHERE site_id = ? AND locale = ? LIMIT 1
  `, [input.siteId, locale])
  if (!localeRow?.is_source) badRequest('Translated tenant-page variants must reference an existing source page')

  const existingVariants = await queryAll<{ path: string; }>(db, `
    SELECT path
      FROM tenant_page_variants
     WHERE site_id = ? AND locale = ?
  `, [input.siteId, locale])
  const existingPaths = new Set<string>()
  for (const row of existingVariants) {
    existingPaths.add(normalizeTenantPagePath(row.path))
  }
  const existingRedirects = await queryAll<{ from_path: string }>(db, `
    SELECT from_path
      FROM site_redirects
     WHERE site_id = ? AND organization_id = ? AND locale = ?
  `, [input.siteId, input.organizationId, locale])
  const redirectPaths = new Set(existingRedirects.map(row => normalizeTenantPagePath(row.from_path)))
  const requestedPaths = new Set<string>()
  const queries: BatchQuery[] = []
  let created = 0

  for (const pageInput of input.pages) {
    const data = pageInput.data
    if (data.pageId) badRequest('Batch tenant-page creation cannot include an existing page parent')
    const path = normalizeTenantPagePath(data.path)
    if (existingPaths.has(path)) continue
    if (requestedPaths.has(path)) conflict('A batch contains duplicate tenant-page paths')
    requestedPaths.add(path)
    if (isReservedPath(path) && pageInput.trustedSystemPage !== true) {
      conflict('This path is reserved by a platform or product route')
    }
    if (redirectPaths.has(path)) conflict('A tenant redirect already owns this path')

    const pageType = data.pageType ?? 'custom'
    if (pageType === 'system' && pageInput.trustedSystemPage !== true) {
      badRequest('System pages are managed by the site template')
    }
    const effectiveData: TenantPageEditorInput = { ...data, locale, path, pageType }
    const metadata = metadataForInput(effectiveData, locale, path)
    const blocks = normalizeTenantPageBlocks(effectiveData.blocks)
    await assertTenantPageSupport(db, input.organizationId, input.siteId, effectiveData, blocks)

    const pageId = crypto.randomUUID()
    const variantId = effectiveData.id ?? crypto.randomUUID()
    const documentId = crypto.randomUUID()
    const now = new Date().toISOString()
    const placementQueries = await tenantPagePlacementQueries(db, input.organizationId, input.siteId, blocks, now)
    const pageQuery: BatchQuery = {
      query: "INSERT INTO tenant_pages (id, organization_id, site_id, title, slug, page_type, recipe, summary, sort_order, source, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pages', ?, ?)",
      params: [pageId, input.organizationId, input.siteId, metadata.title, path === '/' ? 'home' : path.slice(1).replaceAll('/', '-'), metadata.pageType, metadata.recipe, metadata.summary, now, input.userId ?? null],
    }
    const variantQuery: BatchQuery = {
      query: "INSERT INTO tenant_page_variants (id, organization_id, site_id, page_id, locale, document_id, path, title, summary, seo_title, seo_description, canonical_url, robots, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [variantId, input.organizationId, input.siteId, pageId, locale, documentId, path, metadata.title, metadata.summary, metadata.seoTitle, metadata.seoDescription, metadata.canonicalUrl, metadata.robots, now, now, input.userId ?? null],
    }
    const prepared = prepareContentDocumentWithBlocks('tenant_page', variantId, blocksAsInputs(blocks), {
      documentId,
      additionalQueriesBefore: [pageQuery, variantQuery],
      additionalQueriesAfter: [...placementQueries, {
        query: 'UPDATE tenant_page_variants SET updated_at = ?, updated_by = ? WHERE id = ?',
        params: [now, input.userId ?? null, variantId],
      }],
    })
    queries.push(...prepared.queries)
    existingPaths.add(path)
    created += 1
  }

  if (created > 0) {
    queries.push(publicResourceCacheInvalidationQuery(input.siteId, 'tenant-page-seed'))
    await executeBatch(db, queries)
  }
  return { created }
}

export interface OnboardingTenantPageInput {
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
  trustedSystemPage?: boolean
}

interface OnboardingTenantPageVariantRow extends TenantPageVariantRow {
  document_id: string | null
  document_created_at: string | null
  document_updated_at: string | null
}

/**
 * Apply onboarding's generated page snapshots as one canonical domain write.
 *
 * Site creation seeds the default pages first, so the common path is a bulk
 * replacement of existing documents. A single variant/document prefetch and
 * one D1 batch replace the old per-page editor lifecycle. Missing pages still
 * flow through createTenantPagesBatch so the template remains the source of
 * truth for new page rows.
 */
export async function applyOnboardingTenantPages(
  db: DbClient,
  input: {
    organizationId: string
    siteId: string
    userId: string | null
    pages: OnboardingTenantPageInput[]
  },
) {
  if (!input.pages.length) return { updated: 0, created: 0 }

  const pages = input.pages.map(page => ({
    ...page,
    path: normalizeTenantPagePath(page.path),
  }))
  const paths = pages.map(page => page.path)
  if (new Set(paths).size !== paths.length) badRequest('Onboarding page paths must be unique')
  const locale = await resolveLocale(db, input.siteId, 'en')
  const existingRows = await queryAll<OnboardingTenantPageVariantRow>(db, `
    SELECT v.id AS variant_id, v.page_id, v.organization_id, v.site_id, v.locale,
           v.path, v.title, v.summary, v.seo_title,
           v.seo_description, v.canonical_url, v.robots, p.page_type, p.recipe,
           p.sort_order, v.document_id, v.updated_at,
           d.id AS document_id, d.created_at AS document_created_at, d.updated_at AS document_updated_at
      FROM tenant_page_variants v
      JOIN tenant_pages p ON p.id = v.page_id
      LEFT JOIN content_documents d
        ON d.id = v.document_id
       AND d.owner_type = 'tenant_page'
       AND d.owner_id = v.id
     WHERE v.site_id = ? AND v.organization_id = ? AND v.locale = ?
       AND v.path IN (SELECT value FROM json_each(?))
  `, [input.siteId, input.organizationId, locale, d1JsonStringSet(paths)])
  const existingByPath = new Map<string, OnboardingTenantPageVariantRow>()
  for (const row of existingRows) {
    existingByPath.set(normalizeTenantPagePath(row.path), row)
  }

  const replacementQueries: BatchQuery[] = []
  const missingPages: OnboardingTenantPageInput[] = []
  let updated = 0
  for (const page of pages) {
    const row = existingByPath.get(page.path)
    if (!row) {
      missingPages.push(page)
      continue
    }
    if (!row.document_id || !row.document_created_at || !row.document_updated_at) {
      throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
    }

    const effectiveData: TenantPageEditorInput = {
      ...page,
      locale,
      path: page.path,
      title: page.title,
      summary: page.summary === undefined ? row.summary : page.summary,
      seoTitle: page.seoTitle === undefined ? row.seo_title : page.seoTitle,
      seoDescription: page.seoDescription === undefined ? row.seo_description : page.seoDescription,
      canonicalUrl: page.canonicalUrl === undefined ? row.canonical_url : page.canonicalUrl,
      robots: page.robots === undefined ? row.robots : page.robots,
      pageType: row.page_type,
      recipe: row.recipe,
      sortOrder: page.sortOrder === undefined ? row.sort_order : page.sortOrder,
    }
    const metadata = metadataForInput(effectiveData, locale, page.path)
    const blocks = normalizeTenantPageBlocks(page.blocks)
    await assertTenantPageSupport(db, input.organizationId, input.siteId, effectiveData, blocks)

    const document = {
      id: row.document_id,
      owner_type: 'tenant_page' as const,
      owner_id: row.variant_id,
      created_at: row.document_created_at,
      updated_at: row.document_updated_at,
    }
    const now = new Date().toISOString()
    const placementQueries = await tenantPagePlacementQueries(db, input.organizationId, input.siteId, blocks, now)
    const prepared = prepareContentDocumentBlocksReplacement(document, blocksAsInputs(blocks), {
      expected_document_updated_at: row.document_updated_at,
      additionalQueriesAfter: [
        ...placementQueries,
        {
          query: 'UPDATE tenant_page_variants SET path = ?, title = ?, summary = ?, seo_title = ?, seo_description = ?, canonical_url = ?, robots = ?, updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ? AND document_id = ?',
          params: [page.path, metadata.title, metadata.summary, metadata.seoTitle, metadata.seoDescription, metadata.canonicalUrl, metadata.robots, now, input.userId, row.variant_id, input.siteId, input.organizationId, row.document_id],
        },
        {
          query: `UPDATE tenant_pages SET
            title = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE title END,
            page_type = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE page_type END,
            recipe = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE recipe END,
            summary = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE summary END,
            sort_order = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN COALESCE(?, sort_order) ELSE sort_order END,
            updated_at = ?, updated_by = ?
            WHERE id = ? AND site_id = ? AND organization_id = ?`,
          params: [
            input.siteId, locale, metadata.title,
            input.siteId, locale, metadata.pageType,
            input.siteId, locale, metadata.recipe,
            input.siteId, locale, metadata.summary,
            input.siteId, locale, effectiveData.sortOrder ?? null,
            now, input.userId,
            row.page_id, input.siteId, input.organizationId,
          ],
        },
      ],
    })
    replacementQueries.push(...prepared.queries)
    updated += 1
  }

  if (replacementQueries.length) {
    replacementQueries.push(publicResourceCacheInvalidationQuery(input.siteId, 'tenant-page-onboarding-import'))
    await executeBatch(db, replacementQueries)
  }

  let created = 0
  if (missingPages.length) {
    const result = await createTenantPagesBatch(db, {
      organizationId: input.organizationId,
      siteId: input.siteId,
      userId: input.userId,
      pages: missingPages.map(page => ({
        trustedSystemPage: page.trustedSystemPage,
        data: {
          locale,
          path: page.path,
          title: page.title,
          summary: page.summary,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
          canonicalUrl: page.canonicalUrl,
          robots: page.robots,
          pageType: page.pageType,
          recipe: page.recipe,
          sortOrder: page.sortOrder,
          blocks: page.blocks,
        },
      })),
    })
    created = result.created
  }
  return { updated, created }
}

export async function createTenantPage(db: DbClient, input: { organizationId: string; siteId: string; userId: string | null; data: TenantPageEditorInput; trustedSystemPage?: boolean; env: CloudflareEnv }) {
  const traceId = crypto.randomUUID().slice(0, 8)
  console.log(`[TRACE ${traceId}] createTenantPage START t=${Date.now()} path=${input.data.path} pageId=${input.data.pageId}`)
  const locale = await resolveLocale(db, input.siteId, input.data.locale)
  const existingPage = input.data.pageId
    ? await queryFirst<{ id: string; organization_id: string; site_id: string; page_type: TenantPageType; recipe: string | null } | null>(db, `
        SELECT id, organization_id, site_id, page_type, recipe
          FROM tenant_pages
         WHERE id = ? AND organization_id = ? AND site_id = ?
         LIMIT 1
      `, [input.data.pageId, input.organizationId, input.siteId])
    : null
  if (input.data.pageId && !existingPage) notFound('Tenant page parent not found')
  const localeRow = await queryFirst<{ is_source: number } | null>(db, `
    SELECT is_source FROM site_locales WHERE site_id = ? AND locale = ? LIMIT 1
  `, [input.siteId, locale])
  if (!existingPage && !localeRow?.is_source) badRequest('Translated tenant-page variants must reference an existing source page')
  const sourceVariant = existingPage
    ? await queryFirst<{ path: string } | null>(db, `
        SELECT v.path
          FROM tenant_page_variants v
          JOIN site_locales l ON l.site_id = v.site_id AND l.locale = v.locale AND l.is_source = 1
         WHERE v.page_id = ? AND v.organization_id = ? AND v.site_id = ?
         LIMIT 1
      `, [existingPage.id, input.organizationId, input.siteId])
    : null
  if (existingPage && !sourceVariant) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page source variant is missing' })
  console.log(`[TRACE ${traceId}] sourceVariant lookup DONE t=${Date.now()}`)
  const existingIdentity = existingPage
    ? await canonicalTenantPageIdentity(db, {
        site_id: input.siteId,
        locale,
        page_type: existingPage.page_type,
        recipe: existingPage.recipe,
      }, {
        pageType: input.data.pageType,
        recipe: input.data.recipe,
      })
    : null
  const effectiveData: TenantPageEditorInput = {
    ...input.data,
    ...(existingPage ? {
      pageType: existingIdentity?.pageType ?? existingPage.page_type,
      recipe: existingIdentity?.recipe ?? existingPage.recipe,
    } : {}),
  }
  const existingSystemPage = existingPage?.page_type === 'system'
  if (effectiveData.pageType === 'system' && !input.trustedSystemPage && !existingSystemPage) badRequest('System pages are managed by the site template')
  const requestedPath = existingPage ? sourceVariant!.path : input.data.path
  console.log(`[TRACE ${traceId}] assertTenantPagePathAvailable START t=${Date.now()}`)
  const path = await assertTenantPagePathAvailable(db, {
    siteId: input.siteId,
    locale,
    path: requestedPath,
    allowSystemPath: input.trustedSystemPage === true || existingSystemPage,
  })
  console.log(`[TRACE ${traceId}] assertTenantPagePathAvailable DONE t=${Date.now()} path=${path}`)
  const metadata = metadataForInput(effectiveData, locale, path)
  const blocks = normalizeTenantPageBlocks(effectiveData.blocks)
  await assertTenantPageSupport(db, input.organizationId, input.siteId, effectiveData, blocks)
  const pageId = existingPage?.id ?? crypto.randomUUID()
  const variantId = effectiveData.id ?? crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const now = new Date().toISOString()
  const placementQueries = await tenantPagePlacementQueries(db, input.organizationId, input.siteId, blocks, now)
  const pageQuery: BatchQuery = {
    query: "INSERT INTO tenant_pages (id, organization_id, site_id, title, slug, page_type, recipe, summary, sort_order, source, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pages', ?, ?)",
    params: [pageId, input.organizationId, input.siteId, metadata.title, path === '/' ? 'home' : path.slice(1).replaceAll('/', '-'), metadata.pageType, metadata.recipe, metadata.summary, now, input.userId],
  }
  const variantQuery: BatchQuery = {
    query: "INSERT INTO tenant_page_variants (id, organization_id, site_id, page_id, locale, document_id, path, title, summary, seo_title, seo_description, canonical_url, robots, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    params: [variantId, input.organizationId, input.siteId, pageId, locale, documentId, path, metadata.title, metadata.summary, metadata.seoTitle, metadata.seoDescription, metadata.canonicalUrl, metadata.robots, now, now, input.userId],
  }
  console.log(`[TRACE ${traceId}] createContentDocumentWithBlocks START t=${Date.now()}`)
  await createContentDocumentWithBlocks(db, 'tenant_page', variantId, blocksAsInputs(blocks), {
    documentId,
    additionalQueriesBefore: [
      ...(existingPage ? [] : [pageQuery]),
      variantQuery,
    ],
    additionalQueriesAfter: [...placementQueries, {
      query: 'UPDATE tenant_page_variants SET updated_at = ?, updated_by = ? WHERE id = ?',
      params: [now, input.userId, variantId],
    }, publicResourceCacheInvalidationQuery(input.siteId, 'tenant-page-create')],
  })
  console.log(`[TRACE ${traceId}] createContentDocumentWithBlocks DONE t=${Date.now()}`)
  console.log(`[TRACE ${traceId}] refreshSocialCard START t=${Date.now()} path=${path}`)
  if (path === '/') {
    // The homepage is represented by the site card. Refresh the site card only.
    await refreshSocialCard({ db, env: input.env, owner: { owner_type: 'site', owner_id: input.siteId }, actorId: input.userId })
  } else {
    await refreshSocialCard({ db, env: input.env, owner: { owner_type: 'tenant_page', owner_id: variantId }, actorId: input.userId })
  }
  console.log(`[TRACE ${traceId}] refreshSocialCard DONE t=${Date.now()}`)
  return { page: await getTenantPageForEditor(db, variantId) }
}

export async function updateTenantPage(db: DbClient, variantId: string, input: { userId: string | null; data: TenantPageEditorInput; scope: TenantPageScope; env: CloudflareEnv }) {
  const row = await getVariantRow(db, variantId, input.scope)
  if (!row) notFound('Tenant page variant not found')
  if (!row.document_id) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page has no content document' })
  const document = await getContentDocumentById(db, row.document_id)
  if (!document) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (!input.data.expectedDocumentUpdatedAt || document.updated_at !== input.data.expectedDocumentUpdatedAt) conflict('Tenant page content was updated by another writer')
  const currentSnapshot = await getContentEditorSnapshotForDocument(db, document)
  if (!currentSnapshot) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  const currentBlocks = await attachTenantPageMedia(
    db,
    row.site_id,
    currentSnapshot.blocks.map(block => ({ ...block, media: [] })) as TenantPageBlock[],
  )
  const identity = await canonicalTenantPageIdentity(db, row, {
    pageType: input.data.pageType,
    recipe: input.data.recipe,
  })
  const pageType = identity.pageType
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
    recipe: input.data.recipe === undefined ? identity.recipe : input.data.recipe,
  }
  const path = await assertTenantPagePathAvailable(db, { siteId: row.site_id, locale: row.locale, path: input.data.path ?? row.path, excludeVariantId: variantId, allowSystemPath: row.page_type === 'system' })
  const metadata = metadataForInput(effectiveInput, row.locale, path)
  const blocks = normalizeTenantPageBlocks(preserveOmittedBlockMedia(input.data.blocks, currentBlocks))
  await assertTenantPageSupport(db, row.organization_id, row.site_id, effectiveInput, blocks, { checkCustomPageEntitlement: row.page_type !== 'custom' && pageType === 'custom' })
  const now = new Date().toISOString()
  const placementQueries = await tenantPagePlacementQueries(db, input.scope.organizationId, input.scope.siteId, blocks, now)
  const pathChanged = path !== row.path
  if (pathChanged) {
    await assertTenantPageRedirectLocaleSafe(db, { siteId: row.site_id, locale: row.locale, fromPath: row.path, variantId })
    await assertTenantPageRedirectWritable(db, {
      siteId: row.site_id,
      organizationId: row.organization_id,
      locale: row.locale,
      fromPath: row.path,
      variantId,
    })
  }
  const redirectQueries = pathChanged
    ? [
        ...await prepareTenantPageRedirectFlatten(db, {
          siteId: row.site_id,
          organizationId: row.organization_id,
          locale: row.locale,
          fromPath: row.path,
          toPath: path,
        }, now),
        {
          query: "INSERT INTO site_redirects (id, organization_id, site_id, locale, owner_type, owner_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, 'tenant_page', ?, ?, ?, 301, 'redirect', 'tenant_page_path_change', 'tenant-pages', ?, ?) ON CONFLICT(site_id, locale, from_path) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id, to_path = excluded.to_path, status_code = excluded.status_code, behavior = excluded.behavior, reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at",
          params: [crypto.randomUUID(), row.organization_id, row.site_id, row.locale, variantId, row.path, path, now, now],
        },
      ]
    : []
  const updateVariant: BatchQuery = {
    query: 'UPDATE tenant_page_variants SET path = ?, title = ?, summary = ?, seo_title = ?, seo_description = ?, canonical_url = ?, robots = ?, updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND organization_id = ?',
    params: [path, metadata.title, metadata.summary, metadata.seoTitle, metadata.seoDescription, metadata.canonicalUrl, metadata.robots, now, input.userId, variantId, input.scope.siteId, input.scope.organizationId],
  }
  const updatePage: BatchQuery = {
    query: `UPDATE tenant_pages SET
      title = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE title END,
      page_type = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE page_type END,
      recipe = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE recipe END,
      summary = CASE WHEN EXISTS (SELECT 1 FROM site_locales WHERE site_id = ? AND locale = ? AND is_source = 1) THEN ? ELSE summary END,
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
  await replaceContentDocumentBlocks(db, 'tenant_page', variantId, blocksAsInputs(blocks), {
    expected_document_updated_at: input.data.expectedDocumentUpdatedAt,
    additionalQueriesAfter: [...placementQueries, updateVariant, updatePage, ...redirectQueries, publicResourceCacheInvalidationQuery(input.scope.siteId, 'tenant-page-update')],
  })
  if (row.path === '/' || path === '/') {
    // The homepage is represented by the site card. Refresh the site card only.
    await refreshSocialCard({ db, env: input.env, owner: { owner_type: 'site', owner_id: input.scope.siteId }, actorId: input.userId })
  } else {
    await refreshSocialCard({ db, env: input.env, owner: { owner_type: 'tenant_page', owner_id: variantId }, actorId: input.userId })
  }
  return { page: await getTenantPageForEditor(db, variantId, input.scope) }
}

export async function listPublishedTenantPagePaths(db: DbClient, siteId: string, locale?: string | null) {
  const resolvedLocale = await resolveLocale(db, siteId, locale)
  return await queryAll<{ id: string; path: string; title: string; updated_at: string; robots: string | null }>(db, `
    SELECT v.id, v.path, v.title, v.updated_at, v.robots
      FROM tenant_page_variants v
     WHERE v.site_id = ? AND v.locale = ?
     ORDER BY path ASC
  `, [siteId, resolvedLocale])
}

export async function getTenantPageById(db: DbClient, variantId: string, scope?: TenantPageScope) {
  return await getTenantPageForEditor(db, variantId, scope)
}

export async function getTenantPageForEditorByPath(db: DbClient, siteId: string, path: string, locale?: string | null) {
  const resolvedLocale = await resolveLocale(db, siteId, locale)
  const row = await queryFirst<{ id: string } | null>(db, `
    SELECT id FROM tenant_page_variants
     WHERE site_id = ? AND locale = ? AND path = ?
     LIMIT 1
  `, [siteId, resolvedLocale, normalizeTenantPagePath(path)])
  if (!row) notFound('Tenant page variant not found')
  return await getTenantPageForEditor(db, row.id)
}
