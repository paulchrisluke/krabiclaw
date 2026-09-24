import { HTTPError } from 'nitro';
import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import {
  createContentDocumentWithBlocks,
  formatBlockOutline,
  getContentDocumentById,
  getContentEditorSnapshotForDocument,
  listBlocksForDocument,
  prepareContentDocumentDeletion,
  prepareContentDocumentUpdate,
  prepareContentDocumentWithBlocks,
  updateContentDocument,
  type ContentBlockInput,
  type ContentDocumentInput } from '~/server/utils/content/documents'
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
import { hasOrganizationEntitlement } from '~/server/utils/billing'
import type { CloudflareEnv } from '~/server/utils/auth'
import { refreshSocialCard } from '~/server/utils/social-card'
import { normalizeDomain } from '~/server/utils/domain-shared'
import { assertExactCanonicalLocale } from '~/server/utils/localization'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
import { buildSingleMediaPlacementQueries, insertInitialMediaPlacements, hydrateMediaAssetRefs } from '~/server/utils/media-asset-manager'
import { isSingleMediaPlacement } from '~/shared/media-placement-contract'
import { getMediaPlacements } from '~/server/utils/media-placement'
import { loadOrganizationTemplate } from '~/server/utils/content/publishing'
import { templateAllowsPageDocumentAt, templateRendersPageDocumentAt } from '~/shared/tenant-page-paths'
import type { PublicTemplateDefinition } from '~/utils/template-registry'
import { CLAIMED_PUBLIC_ROUTES } from '#claimed-public-routes'
import { formatTenantLocalePath } from '~/utils/tenant-locale-path'

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
  pageType?: TenantPageType
  recipe?: string | null
  sortOrder?: number | null
  blocks: unknown
  expectedUpdatedAt?: string | null
}

export interface TenantPageDocument {
  id: string
  updated_at: string
}

export interface TenantPageDto {
  id: string
  page_id: string
  organization_id: string
  locale: string
  path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  page_type: TenantPageType
  recipe: string | null
  sort_order: number
  blocks: TenantPageBlock[]
  document: TenantPageDocument
  updated_at: string
}

interface PageRepresentationRow {
  id: string
  page_id: string
  organization_id: string
  locale: string
  path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  page_type: TenantPageType
  recipe: string | null
  sort_order: number
  updated_at: string
}


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
    pageType,
    recipe: asString(input.recipe, 'recipe'),
  }
}

/**
 * May this site hold a custom page?
 *
 * A custom page is a subscription feature a customer buys. KrabiClaw's own site
 * is the seller, not a subscriber: the platform organization holds no
 * subscription and never will, so asking `custom_pages` of it refused every
 * page KrabiClaw publishes about itself (#903).
 */
async function organizationMayHoldCustomPages(env: CloudflareEnv, db: DbClient, organizationId: string): Promise<boolean> {
  const { template } = await loadOrganizationTemplate(db, organizationId)
  if (template.slug === 'platform') return true
  return await hasOrganizationEntitlement(env, organizationId, 'custom_pages')
}

async function assertTenantPageSupport(env: CloudflareEnv, db: DbClient, organizationId: string, input: TenantPageEditorInput, blocks: TenantPageBlock[], options: { checkCustomPageEntitlement?: boolean } = {}) {
  const pageType = input.pageType ?? 'custom'
  if (!TENANT_PAGE_TYPES.includes(pageType)) badRequest('pageType is invalid')
  if (pageType === 'custom' && options.checkCustomPageEntitlement !== false && !(await organizationMayHoldCustomPages(env, db, organizationId))) {
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
      SELECT domain FROM organization_domains WHERE organization_id = ? AND status = 'active'
    `, [organizationId])
    if (!allowedHosts.some(row => normalizeDomain(row.domain) === normalizeDomain(parsed.hostname))) {
      badRequest('canonicalUrl must use an approved domain for this organization')
    }
  }
}

function blocksAsInputs(blocks: TenantPageBlock[]): ContentBlockInput[] {
  return blocks.map(block => ({ id: block.id, source_block_id: block.source_block_id, parent_block_id: block.parent_block_id, level: block.level, type: block.type, data: block.data }))
}

async function tenantPagePlacementQueries(
  db: DbClient,
  organizationId: string,
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
    organizationId,
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
          refs: (bySlot.get(slot) ?? []).map(item => ({ asset_id: item.asset_id })),
          allowedKinds: ['image', 'video'],
          fieldName: `blocks.${block.id}.media`,
        })
        queries.push(...buildSingleMediaPlacementQueries({
          organizationId,
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
        refs: items.map(item => ({ asset_id: item.asset_id })),
        allowedKinds: ['image', 'video'],
        fieldName: `blocks.${block.id}.media`,
      })
      queries.push(...insertInitialMediaPlacements({
        organizationId,
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

async function attachTenantPageMedia(db: DbClient, organizationId: string, blocks: TenantPageBlock[]): Promise<TenantPageBlock[]> {
  const placements = await getMediaPlacements(db, { organizationId, ownerType: 'content_block', ownerIds: blocks.map(block => block.id) })
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
      file_name: item.file_name,
    })),
  }))
}


export interface TenantPageScope {
  organizationId: string
}

async function getPageRepresentation(db: DbClient, variantId: string, scope?: TenantPageScope): Promise<PageRepresentationRow | null> {
  return await queryFirst<PageRepresentationRow | null>(db, [
    'SELECT v.id, COALESCE(v.root_id, v.id) AS page_id, v.organization_id, v.locale, v.path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url,',
    `       json_extract(p.metadata_json, '$.page_type') AS page_type, json_extract(p.metadata_json, '$.recipe') AS recipe, p.sort_order, v.updated_at`,
    `  FROM content_documents v JOIN content_documents p ON p.id = COALESCE(v.root_id, v.id) AND p.row_role = 'root' AND p.kind = 'page'`,
    ` WHERE v.row_role IN ('root','representation') AND v.kind = 'page' AND v.id = ? AND (? IS NULL OR v.organization_id = ?) LIMIT 1`,
  ].join('\n'), [variantId, scope?.organizationId ?? null, scope?.organizationId ?? null])
}

async function resolveLocale(db: DbClient, organizationId: string, locale?: string | null): Promise<string> {
  if (locale?.trim()) {
    const exactLocale = assertExactCanonicalLocale(locale)
    const row = await queryFirst<{ locale: string } | null>(
      db,
      // Authoring: a language being translated is `disabled` until it is
      // published, and its pages have to be writable before then.
      'SELECT locale FROM organization_locales WHERE organization_id = ? AND locale = ? LIMIT 1',
      [organizationId, exactLocale],
    )
    if (!row) notFound('Locale is not configured for this organization')
    return row.locale
  }
  const row = await queryFirst<{ locale: string | null }>(
    db,
    'SELECT locale FROM organization_locales WHERE organization_id = ? AND locale = \'en\' AND is_source = 1 AND status = \'published\' LIMIT 1',
    [organizationId],
  )
  if (!row?.locale) throw new HTTPError({ statusCode: 500, statusMessage: 'Source locale is not configured for this organization' })
  return row.locale
}

export async function assertTenantPagePathAvailable(
  db: DbClient,
  input: { organizationId: string; locale: string; path: string; template: PublicTemplateDefinition; excludeVariantId?: string | null; allowOwnedRedirectVariantId?: string | null },
) {
  const path = normalizeTenantPagePath(input.path)
  // One rule, from one declaration: the template renders a document here, or
  // nothing claims the path and the template's catch-all renders it. The hand
  // lists this replaced named routes that had been deleted and reserved routes
  // that do read a document.
  if (!templateAllowsPageDocumentAt(input.template, CLAIMED_PUBLIC_ROUTES, path)) {
    conflict('This path is reserved by a platform or product route')
  }
  const row = await queryFirst<{ id: string } | null>(db, [
    'SELECT id FROM content_documents',
    `WHERE row_role IN ('root','representation') AND kind = 'page' AND organization_id = ? AND locale = ? AND path = ?`,
    '  AND (? IS NULL OR id <> ?) LIMIT 1',
  ].join('\n'), [input.organizationId, input.locale, path, input.excludeVariantId ?? null, input.excludeVariantId ?? null])
  if (row) conflict('A tenant page already uses this path for the selected locale')
  const redirect = await queryFirst<{ id: string } | null>(db, `
    SELECT id FROM organization_redirects
     WHERE organization_id = ? AND locale = ? AND from_path = ?
       AND (? IS NULL OR owner_id IS NULL OR owner_id <> ?)
     LIMIT 1
  `, [input.organizationId, input.locale, formatTenantLocalePath(path, input.locale), input.allowOwnedRedirectVariantId ?? null, input.allowOwnedRedirectVariantId ?? null])
  if (redirect) conflict('A tenant redirect already owns this path')
  return path
}

async function assertTenantPageRedirectWritable(
  db: DbClient,
  input: { organizationId: string; locale: string; fromPath: string; variantId: string },
) {
  const existing = await queryFirst<{ owner_id: string | null; source: string } | null>(db, `
    SELECT owner_id, source
      FROM organization_redirects
      WHERE organization_id = ? AND locale = ? AND from_path = ?
     LIMIT 1
  `, [ input.organizationId, input.locale, formatTenantLocalePath(input.fromPath, input.locale)])
  if (existing && (existing.owner_id !== input.variantId || existing.source !== 'tenant-pages')) {
    conflict('A manual tenant redirect already owns this path')
  }
}

async function assertTenantPageRedirectLocale(
  db: DbClient,
  input: { organizationId: string; locale: string; fromPath: string; variantId: string },
) {
  const owner = await queryFirst<{ locale: string } | null>(db, `
    SELECT locale
      FROM content_documents
     WHERE row_role IN ('root','representation') AND kind = 'page' AND organization_id = ? AND locale = ? AND path = ?
         AND id <> ?
     LIMIT 1
  `, [input.organizationId, input.locale, input.fromPath, input.variantId])
  if (owner) conflict('A locale-specific redirect cannot replace a path still published by another locale')
}

async function prepareTenantPageRedirectFlatten(
  db: DbClient,
  input: {
    organizationId: string
    locale: string
    fromPath: string
    toPath: string | null
  },
  now: string,
): Promise<BatchQuery[]> {
  const incoming = await queryAll<{ from_path: string; source: string; behavior: string }>(db, `
    SELECT from_path, source, behavior
      FROM organization_redirects
      WHERE organization_id = ? AND locale = ? AND to_path = ?
       AND behavior = 'redirect'
  `, [ input.organizationId, input.locale, formatTenantLocalePath(input.fromPath, input.locale)])
  if (!input.toPath) {
    if (incoming.length) conflict('Cannot archive a page while another redirect points to it')
    return []
  }
  if (incoming.some(redirect => redirect.from_path === formatTenantLocalePath(input.toPath!, input.locale))) {
    conflict('Changing this page path would create a redirect cycle')
  }
  if (incoming.some(redirect => redirect.source !== 'tenant-pages')) {
    conflict('A manual tenant redirect points to this page and cannot be rewritten automatically')
  }
  if (!incoming.length) return []
  return [{
    query: `UPDATE organization_redirects
       SET to_path = ?, updated_at = ?
     WHERE organization_id = ? AND locale = ? AND to_path = ? AND behavior = 'redirect'`,
    params: [formatTenantLocalePath(input.toPath, input.locale), now, input.organizationId, input.locale, formatTenantLocalePath(input.fromPath, input.locale)],
  }]
}

/**
 * The identity an update writes: what the caller stated, checked against the
 * rule that a translated variant cannot diverge from its source.
 *
 * It used to inherit the stored row whenever the caller left a field out, which
 * meant the caller could not tell whether it was setting an identity or being
 * given one. The caller states both now, so this only has to agree or refuse.
 */
async function canonicalTenantPageIdentity(
  db: DbClient,
  row: Pick<PageRepresentationRow, 'organization_id' | 'locale' | 'page_type' | 'recipe'>,
  input: { pageType: TenantPageType; recipe: string | null },
): Promise<{ pageType: TenantPageType; recipe: string | null }> {
  const source = await queryFirst<{ is_source: number } | null>(db, `
    SELECT is_source FROM organization_locales WHERE organization_id = ? AND locale = ? LIMIT 1
  `, [row.organization_id, row.locale])
  const recipe = input.recipe?.trim() || null
  if (!source?.is_source && (input.pageType !== row.page_type || recipe !== row.recipe)) {
    badRequest('A translated tenant-page variant must use the source page identity')
  }
  return { pageType: input.pageType, recipe }
}

function pageDto(row: PageRepresentationRow, document: TenantPageDocument, blocks: TenantPageBlock[]): TenantPageDto {
  return {
    id: row.id,
    page_id: row.page_id,
    organization_id: row.organization_id,
    locale: row.locale,
    path: row.path,
    title: row.title,
    summary: row.summary,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    canonical_url: row.canonical_url,
    page_type: row.page_type,
    recipe: row.recipe,
    sort_order: row.sort_order,
    blocks,
    document,
    updated_at: row.updated_at,
  }
}

export async function listTenantPages(db: DbClient, organizationId: string, opts: { locale?: string | null } = {}) {
  const locale = await resolveLocale(db, organizationId, opts.locale)
  const rows = await queryAll<PageRepresentationRow>(db, [
    'SELECT v.id, COALESCE(v.root_id, v.id) AS page_id, v.organization_id, v.locale, v.path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url,',
    `       json_extract(p.metadata_json, '$.page_type') AS page_type, json_extract(p.metadata_json, '$.recipe') AS recipe, p.sort_order, v.updated_at`,
    `  FROM content_documents v JOIN content_documents p ON p.id = COALESCE(v.root_id, v.id) AND p.row_role = 'root' AND p.kind = 'page'`,
    ` WHERE v.row_role IN ('root','representation') AND v.kind = 'page' AND v.organization_id = ? AND v.locale = ? ORDER BY p.sort_order ASC, v.title ASC`,
  ].join('\n'), [organizationId, locale])
  // Whether each page may be removed is decided here, by the same rule
  // deleteTenantPage enforces, so the list and the endpoint cannot disagree and
  // the dashboard never offers a remove control the server would refuse.
  const { template } = await loadOrganizationTemplate(db, organizationId)
  return rows.map(row => ({
    id: row.id,
    page_id: row.page_id,
    locale: row.locale,
    path: row.path,
    title: row.title,
    page_type: row.page_type,
    recipe: row.recipe,
    sort_order: row.sort_order,
    updated_at: row.updated_at,
    removable: !templateRendersPageDocumentAt(template, normalizeTenantPagePath(row.path)),
  }))
}

// The representation row this page is built from IS its content document row,
// and TenantPageDocument is only {id, updated_at} — both already on the row.
function documentOf(row: PageRepresentationRow): TenantPageDocument {
  return { id: row.id, updated_at: row.updated_at }
}

// Blocks with the media shape the tenant page surfaces use (it carries
// file_name, which the block editors show as the picker's label).
async function tenantPageBlocks(db: DbClient, organizationId: string, documentId: string): Promise<TenantPageBlock[]> {
  const blocks = await listBlocksForDocument(db, documentId)
  return await attachTenantPageMedia(db, organizationId, blocks.map(formatBlockOutline) as unknown as TenantPageBlock[])
}

export async function getTenantPageForEditor(db: DbClient, variantId: string, scope?: TenantPageScope): Promise<TenantPageDto> {
  const row = await getPageRepresentation(db, variantId, scope)
  if (!row) notFound('Tenant page variant not found')
  return pageDto(row, documentOf(row), await tenantPageBlocks(db, row.organization_id, row.id))
}

export async function getPublishedTenantPage(db: DbClient, organizationId: string, path: string, locale?: string | null): Promise<TenantPageDto | null> {
  const resolvedLocale = await resolveLocale(db, organizationId, locale)
  const normalizedPath = normalizeTenantPagePath(path)
  const selectPublished = async (candidateLocale: string) => await queryFirst<PageRepresentationRow | null>(db, [
    'SELECT v.id, COALESCE(v.root_id, v.id) AS page_id, v.organization_id, v.locale, v.path,',
    '       v.title, v.summary, v.seo_title, v.seo_description, v.canonical_url,',
    `       json_extract(p.metadata_json, '$.page_type') AS page_type, json_extract(p.metadata_json, '$.recipe') AS recipe, p.sort_order, v.updated_at`,
    `  FROM content_documents v JOIN content_documents p ON p.id = COALESCE(v.root_id, v.id) AND p.row_role = 'root' AND p.kind = 'page'`,
    " WHERE v.row_role IN ('root','representation') AND v.kind = 'page' AND v.organization_id = ? AND v.locale = ? AND v.path = ? LIMIT 1",
  ].join('\n'), [organizationId, candidateLocale, normalizedPath])
  const row = await selectPublished(resolvedLocale)
  if (!row) return null
  return pageDto(row, documentOf(row), await tenantPageBlocks(db, organizationId, row.id))
}

export async function resolvePublishedTenantPageIdentity(
  db: DbClient,
  organizationId: string,
  path: string,
  locale?: string | null,
) {
  const resolvedLocale = await resolveLocale(db, organizationId, locale)
  const normalizedPath = normalizeTenantPagePath(path)
  const selectPublished = async (candidateLocale: string) => await queryFirst<{
    page_id: string
    page_type: TenantPageType
    recipe: string | null
    locale: string
  } | null>(db, `
    SELECT p.id AS page_id, json_extract(p.metadata_json, '$.page_type') AS page_type, json_extract(p.metadata_json, '$.recipe') AS recipe, v.locale
      FROM content_documents v
      JOIN content_documents p ON p.id = COALESCE(v.root_id, v.id) AND p.row_role = 'root' AND p.kind = 'page'
     WHERE v.row_role IN ('root','representation') AND v.kind = 'page' AND v.organization_id = ? AND v.locale = ? AND v.path = ?
      LIMIT 1
  `, [organizationId, candidateLocale, normalizedPath])
  const page = await selectPublished(resolvedLocale)
  return page
}

export async function createTenantPagesBatch(
  db: DbClient,
  input: {
    env: CloudflareEnv
    organizationId: string
    userId?: string | null
    pages: Array<{
      data: TenantPageEditorInput
      trustedSystemPage?: boolean
    }>
  },
) {
  const locale = await resolveLocale(db, input.organizationId, 'en')
  const { template } = await loadOrganizationTemplate(db, input.organizationId)
  const localeRow = await queryFirst<{ is_source: number } | null>(db, `
    SELECT is_source FROM organization_locales WHERE organization_id = ? AND locale = ? LIMIT 1
  `, [input.organizationId, locale])
  if (!localeRow?.is_source) badRequest('Translated tenant-page variants must reference an existing source page')

  const existingVariants = await queryAll<{ path: string; }>(db, `
    SELECT path
      FROM content_documents
     WHERE row_role IN ('root','representation') AND kind = 'page' AND organization_id = ? AND locale = ?
  `, [input.organizationId, locale])
  const existingPaths = new Set<string>()
  for (const row of existingVariants) {
    existingPaths.add(normalizeTenantPagePath(row.path))
  }
  const existingRedirects = await queryAll<{ from_path: string }>(db, `
    SELECT from_path
      FROM organization_redirects
      WHERE organization_id = ? AND locale = ?
  `, [ input.organizationId, locale])
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
    if (!templateAllowsPageDocumentAt(template, CLAIMED_PUBLIC_ROUTES, path)) {
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
    await assertTenantPageSupport(input.env, db, input.organizationId, effectiveData, blocks)

    const pageId = effectiveData.id ?? crypto.randomUUID()
    const variantId = pageId
    const now = new Date().toISOString()
    const placementQueries = await tenantPagePlacementQueries(db, input.organizationId, blocks, now)
    const prepared = prepareContentDocumentWithBlocks({
      id: variantId, rowRole: 'root', locale: 'en', organizationId: input.organizationId, kind: 'page',
      metadata: { page_type: metadata.pageType, recipe: metadata.recipe }, source: 'pages',
      path, title: metadata.title, summary: metadata.summary, seoTitle: metadata.seoTitle, seoDescription: metadata.seoDescription,
      canonicalUrl: metadata.canonicalUrl, createdBy: input.userId, updatedBy: input.userId,
    }, blocksAsInputs(blocks), {
      additionalQueriesAfter: placementQueries,
    })
    queries.push(...prepared.queries)
    existingPaths.add(path)
    created += 1
  }

  if (created > 0) {
    queries.push(publicResourceCacheInvalidationQuery(input.organizationId, 'tenant-page-seed'))
    await executeBatch(db, queries)
  }
  return { created }
}

// Onboarding commit writes the whole page it collected. Every metadata field is
// stated, so an absent one is null rather than whatever the previous commit left
// behind — there is one source for this document and it is the draft.
export interface OnboardingTenantPageInput {
  path: string
  title: string
  summary: string | null
  seoTitle: string | null
  seoDescription: string | null
  canonicalUrl: string | null
  pageType: TenantPageType
  recipe: string | null
  blocks: unknown
  trustedSystemPage?: boolean
}

interface OnboardingPageRepresentationRow extends PageRepresentationRow {
  created_at: string
}

export async function applyOnboardingTenantPages(
  db: DbClient,
  input: {
    env: CloudflareEnv
    organizationId: string
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
  const locale = await resolveLocale(db, input.organizationId, 'en')
  const existingRows = await queryAll<OnboardingPageRepresentationRow>(db, `
    SELECT v.id, COALESCE(v.root_id, v.id) AS page_id, v.organization_id, v.locale,
           v.path, v.title, v.summary, v.seo_title,
           v.seo_description, v.canonical_url, json_extract(p.metadata_json, '$.page_type') AS page_type, json_extract(p.metadata_json, '$.recipe') AS recipe,
           p.sort_order, v.updated_at,
           v.created_at
      FROM content_documents v
      JOIN content_documents p ON p.id = COALESCE(v.root_id, v.id) AND p.row_role = 'root' AND p.kind = 'page'
     WHERE v.row_role IN ('root','representation') AND v.kind = 'page'  AND v.organization_id = ? AND v.locale = ?
       AND v.path IN (SELECT value FROM json_each(?))
  `, [ input.organizationId, locale, d1JsonStringSet(paths)])
  const existingByPath = new Map<string, OnboardingPageRepresentationRow>()
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
    // page_type and recipe are the page's identity and onboarding does not get
    // to change them; everything else is the document the draft states.
    const effectiveData: TenantPageEditorInput = {
      ...page,
      locale,
      pageType: row.page_type,
      recipe: row.recipe,
    }
    const metadata = metadataForInput(effectiveData, locale, page.path)
    const blocks = normalizeTenantPageBlocks(page.blocks)
    await assertTenantPageSupport(input.env, db, input.organizationId, effectiveData, blocks)

    const document = {
      id: row.id,
      organization_id: input.organizationId,
      kind: 'page' as const,
      row_role: row.locale === 'en' ? 'root' as const : 'representation' as const,
      root_id: row.locale === 'en' ? null : row.page_id,
      locale: row.locale,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
    const now = new Date().toISOString()
    const placementQueries = await tenantPagePlacementQueries(db, input.organizationId, blocks, now)
    const prepared = prepareContentDocumentUpdate(document, {
      blocks: blocksAsInputs(blocks), expected_updated_at: row.updated_at,
      changes: { path: page.path, title: metadata.title, summary: metadata.summary,
        seo_title: metadata.seoTitle, seo_description: metadata.seoDescription, canonical_url: metadata.canonicalUrl,
        updated_by: input.userId,
        metadata: { page_type: metadata.pageType, recipe: metadata.recipe } },
      additionalQueriesAfter: placementQueries,
    })
    replacementQueries.push(...prepared.queries)
    updated += 1
  }

  if (replacementQueries.length) {
    replacementQueries.push(publicResourceCacheInvalidationQuery(input.organizationId, 'tenant-page-onboarding-import'))
    await executeBatch(db, replacementQueries)
  }

  let created = 0
  if (missingPages.length) {
    const result = await createTenantPagesBatch(db, {
      env: input.env,
      organizationId: input.organizationId,
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
          pageType: page.pageType,
          recipe: page.recipe,
          blocks: page.blocks,
        },
      })),
    })
    created = result.created
  }
  return { updated, created }
}

export async function createTenantPage(db: DbClient, input: { organizationId: string; userId: string | null; data: TenantPageEditorInput; trustedSystemPage?: boolean; env: CloudflareEnv }) {
  const locale = await resolveLocale(db, input.organizationId, input.data.locale)
  const existingPage = input.data.pageId
    ? await queryFirst<{ id: string; organization_id: string; page_type: TenantPageType; recipe: string | null } | null>(db, `
        SELECT id, organization_id, json_extract(metadata_json, '$.page_type') AS page_type, json_extract(metadata_json, '$.recipe') AS recipe
          FROM content_documents
         WHERE row_role = 'root' AND kind = 'page' AND id = ? AND organization_id = ? 
         LIMIT 1
      `, [input.data.pageId, input.organizationId])
    : null
  if (input.data.pageId && !existingPage) notFound('Tenant page parent not found')
  const localeRow = await queryFirst<{ is_source: number } | null>(db, `
    SELECT is_source FROM organization_locales WHERE organization_id = ? AND locale = ? LIMIT 1
  `, [input.organizationId, locale])
  if (!existingPage && !localeRow?.is_source) badRequest('Translated tenant-page variants must reference an existing source page')
  // A translated variant's identity is its source page's. The caller may state
  // it, but only to agree with the source; it does not get to pick a different
  // one, and omitting it does not mean "choose for me".
  if (existingPage) {
    const statedRecipe = input.data.recipe === undefined ? undefined : input.data.recipe?.trim() || null
    if ((input.data.pageType !== undefined && input.data.pageType !== existingPage.page_type)
      || (statedRecipe !== undefined && statedRecipe !== existingPage.recipe)) {
      badRequest('A translated tenant-page variant must use the source page identity')
    }
  }
  const effectiveData: TenantPageEditorInput = {
    ...input.data,
    ...(existingPage ? { pageType: existingPage.page_type, recipe: existingPage.recipe } : {}),
  }
  const existingSystemPage = existingPage?.page_type === 'system'
  if (effectiveData.pageType === 'system' && !input.trustedSystemPage && !existingSystemPage) badRequest('System pages are managed by the site template')
  const { template } = await loadOrganizationTemplate(db, input.organizationId)
  const path = await assertTenantPagePathAvailable(db, {
    organizationId: input.organizationId,
    locale,
    path: input.data.path,
    template,
  })
  const metadata = metadataForInput(effectiveData, locale, path)
  const blocks = normalizeTenantPageBlocks(effectiveData.blocks)
  await assertTenantPageSupport(input.env, db, input.organizationId, effectiveData, blocks)
  const pageId = existingPage?.id ?? effectiveData.id ?? crypto.randomUUID()
  const variantId = existingPage ? effectiveData.id ?? crypto.randomUUID() : pageId
  const now = new Date().toISOString()
  const placementQueries = await tenantPagePlacementQueries(db, input.organizationId, blocks, now)
  const representation: ContentDocumentInput = {
    id: variantId, organizationId: input.organizationId, kind: 'page',
    // sort_order lives on the root document, so only the root branch states it.
    // It used to be accepted and dropped: a caller that asked for a position got
    // 0 and no error.
    ...(existingPage ? { rowRole: 'representation', rootId: pageId, locale } : {
      rowRole: 'root', locale: 'en', metadata: { page_type: metadata.pageType, recipe: metadata.recipe }, source: 'pages',
      ...(typeof effectiveData.sortOrder === 'number' ? { sortOrder: effectiveData.sortOrder } : {}),
    }),
    path, title: metadata.title, summary: metadata.summary, seoTitle: metadata.seoTitle, seoDescription: metadata.seoDescription,
    canonicalUrl: metadata.canonicalUrl, createdBy: input.userId, updatedBy: input.userId,
  }
  await createContentDocumentWithBlocks(db, representation, blocksAsInputs(blocks), {
    additionalQueriesAfter: [...placementQueries, publicResourceCacheInvalidationQuery(input.organizationId, 'tenant-page-create')],
  })
  if (path === '/') {
    // The homepage is represented by the site card. Refresh the site card only.
    await refreshSocialCard({ db, env: input.env, owner: { owner_type: 'organization', owner_id: input.organizationId }, actorId: input.userId })
  } else {
    await refreshSocialCard({ db, env: input.env, owner: { owner_type: 'content_document', owner_id: variantId }, actorId: input.userId })
  }
  return { page: await getTenantPageForEditor(db, variantId) }
}

/**
 * Remove a tenant page, or one of its translations.
 *
 * Scope follows the row: deleting a translation removes that translation, and
 * deleting the source removes the page and every translation with it — the
 * content_documents_root_scope_fk cascade takes the representation rows, and
 * prepareContentDocumentDeletion clears the placements and redirects that point
 * at them by owner_id first, because those carry no foreign key of their own.
 *
 * A page the site's template renders is not the owner's to remove: deleting it
 * would leave a route with nothing to show. That is the same declaration the
 * writer checks before creating a page, not a second rule about page_type — a
 * dead row the template no longer maps, like the /locations/main every site used
 * to be seeded with, is deletable precisely because nothing renders it.
 */
export async function deleteTenantPage(db: DbClient, variantId: string, input: { scope: TenantPageScope; expectedUpdatedAt: string; env: CloudflareEnv }) {
  const row = await getPageRepresentation(db, variantId, input.scope)
  if (!row) notFound('Tenant page variant not found')
  const document = await getContentDocumentById(db, row.id)
  if (!document) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (document.updated_at !== input.expectedUpdatedAt) conflict('Tenant page content was updated by another writer')

  const { template } = await loadOrganizationTemplate(db, row.organization_id)
  if (templateRendersPageDocumentAt(template, normalizeTenantPagePath(row.path))) {
    conflict("This page is one the organization's template renders, so it cannot be deleted")
  }

  // A page another page links to cannot simply go. `page_grid` renders its
  // cards from the referenced documents, and a reference to a page that is
  // gone is a 500 on the referring page, by design — "the editor chose it and
  // needs to know" (server/utils/public-tenant-pages.ts). The editor is told
  // here, before the delete, which page would break. The deleted page's own
  // translations are not referrers: they go with it.
  const referrers = await queryAll<{ path: string }>(db, `
    SELECT DISTINCT d.path
      FROM content_blocks b
      JOIN content_documents d ON d.id = b.document_id
      JOIN json_each(b.data_json, '$.page_ids') ref
     WHERE b.type = 'page_grid' AND d.organization_id = ? AND COALESCE(d.root_id, d.id) <> ? AND ref.value = ?
     ORDER BY d.path
  `, [row.organization_id, row.id, row.id])
  if (referrers.length > 0) {
    conflict(`${referrers.map(item => item.path).join(', ')} link${referrers.length === 1 ? 's' : ''} to this page; remove the link before deleting it`)
  }

  const translations = row.locale === 'en'
    ? await queryAll<{ id: string; locale: string; path: string; updated_at: string }>(db, `
        SELECT id, locale, path, updated_at FROM content_documents
         WHERE root_id = ? AND row_role = 'representation'  AND organization_id = ?
         ORDER BY locale
      `, [row.id, row.organization_id])
    : []
  const removedLocales = translations.map(translation => translation.locale)

  // The same rule archiving applies: a redirect somebody else owns that lands
  // on a removed variant would land on nothing. The page's own redirects go
  // with it in the batch, so they are not counted.
  const removed = [{ locale: row.locale, path: row.path }, ...translations]
  const incoming = {
    sql: `FROM organization_redirects
         WHERE organization_id = ? AND behavior = 'redirect'
           AND NOT (owner_type = 'content_document' AND owner_id IN (
             SELECT id FROM content_documents WHERE (id = ? OR root_id = ?) AND organization_id = ?))
           AND (${removed.map(() => '(locale = ? AND to_path = ?)').join(' OR ')})`,
    params: [
      row.organization_id, row.id, row.id, row.organization_id,
      ...removed.flatMap(variant => [variant.locale, formatTenantLocalePath(variant.path, variant.locale)]),
    ],
  }
  const pointedAt = await queryFirst<{ count: number }>(db, `SELECT count(*) AS count ${incoming.sql}`, incoming.params)
  if (pointedAt?.count) conflict('Cannot delete a page while another redirect points to it')

  // The timestamps, the translation set and the redirect rule are checked
  // again inside the batch. The reads above give the caller a clear conflict,
  // but queries run between them and this write, and a page changed in that
  // window must not be deleted on the strength of a snapshot taken before it.
  const now = new Date().toISOString()
  await executeBatch(db, [
    {
      query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
        SELECT NULL, ?, NULL, 'markdown', 0, NULL, '{}', ?, ? WHERE EXISTS (SELECT 1 ${incoming.sql})`,
      params: [row.id, now, now, ...incoming.params],
    },
    ...prepareContentDocumentDeletion({
      documentId: row.id,
      organizationId: row.organization_id,
      expectedUpdatedAt: input.expectedUpdatedAt,
      expectedRepresentations: row.locale === 'en'
        ? translations.map(translation => ({ id: translation.id, updatedAt: translation.updated_at }))
        : undefined,
    }),
    publicResourceCacheInvalidationQuery(row.organization_id, 'tenant-page-delete'),
  ])

  return { deleted: { id: row.id, path: row.path, locale: row.locale, removed_locales: removedLocales } }
}

export async function updateTenantPage(db: DbClient, variantId: string, input: { userId: string | null; data: TenantPageEditorInput; scope: TenantPageScope; env: CloudflareEnv }) {
  // An update replaces the document, so the caller states the path and title it
  // wants written. Both are required on the input type; say so to the caller
  // that sent neither instead of failing later on a value it never supplied.
  if (typeof input.data.path !== 'string' || !input.data.path.trim()) badRequest('path is required')
  if (typeof input.data.title !== 'string' || !input.data.title.trim()) badRequest('title is required')
  // sortOrder is the page's position in its site's page list. An update writes
  // the position the caller states; it used to be COALESCE(?, sort_order), which
  // is the same read-the-row-back fallback wearing SQL.
  if (typeof input.data.sortOrder !== 'number') badRequest('sortOrder is required')
  const sortOrder = input.data.sortOrder
  // Identity is stated, not inherited. Leaving it out used to mean "keep what is
  // stored" in one function and "clear it" in the next, which turned an omitted
  // recipe into `recipe is required for recipe pages`.
  if (!input.data.pageType) badRequest('pageType is required')
  if (input.data.recipe === undefined) badRequest('recipe is required, and may be null')
  const row = await getPageRepresentation(db, variantId, input.scope)
  if (!row) notFound('Tenant page variant not found')
  const document = await getContentDocumentById(db, row.id)
  if (!document) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  if (!input.data.expectedUpdatedAt || document.updated_at !== input.data.expectedUpdatedAt) conflict('Tenant page content was updated by another writer')
  const currentSnapshot = await getContentEditorSnapshotForDocument(db, document)
  if (!currentSnapshot) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant page content document not found' })
  const currentBlocks = await attachTenantPageMedia(
    db,
    row.organization_id,
    currentSnapshot.blocks.map(block => ({ ...block, media: [] })) as TenantPageBlock[],
  )
  const identity = await canonicalTenantPageIdentity(db, row, {
    pageType: input.data.pageType,
    recipe: input.data.recipe ?? null,
  })
  const pageType = identity.pageType
  if (pageType === 'system' && row.page_type !== 'system') badRequest('Only an existing system page may remain a system page')
  // An update writes the document the caller sent. It does not read the stored
  // row back in for the fields the caller left out: doing that turned "change
  // one block" into a silent full-document rewrite, and made the update reject
  // a path the caller never named. pageType and recipe are the page's identity,
  // resolved above against the source-locale rule, not content the caller omits.
  const effectiveInput = { ...input.data, pageType, recipe: identity.recipe }
  const { template } = await loadOrganizationTemplate(db, row.organization_id)
  const path = await assertTenantPagePathAvailable(db, { organizationId: row.organization_id, locale: row.locale, path: input.data.path, excludeVariantId: variantId, template })
  const metadata = metadataForInput(effectiveInput, row.locale, path)
  const blocks = normalizeTenantPageBlocks(preserveOmittedBlockMedia(input.data.blocks, currentBlocks))
  await assertTenantPageSupport(input.env, db, row.organization_id, effectiveInput, blocks, { checkCustomPageEntitlement: row.page_type !== 'custom' && pageType === 'custom' })
  const now = new Date().toISOString()
  const placementQueries = await tenantPagePlacementQueries(db, input.scope.organizationId, blocks, now)
  const pathChanged = path !== row.path
  if (pathChanged) {
    await assertTenantPageRedirectLocale(db, { organizationId: row.organization_id, locale: row.locale, fromPath: row.path, variantId })
    await assertTenantPageRedirectWritable(db, {
      organizationId: row.organization_id,
      locale: row.locale,
      fromPath: row.path,
      variantId,
    })
  }
  const redirectQueries = pathChanged
    ? [
        ...await prepareTenantPageRedirectFlatten(db, {
          organizationId: row.organization_id,
          locale: row.locale,
          fromPath: row.path,
          toPath: path,
        }, now),
        {
          query: "INSERT INTO organization_redirects (id, organization_id, locale, owner_type, owner_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at) VALUES (?, ?, ?, 'content_document', ?, ?, ?, 301, 'redirect', 'tenant_page_path_change', 'tenant-pages', ?, ?) ON CONFLICT(organization_id, locale, from_path) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id, to_path = excluded.to_path, status_code = excluded.status_code, behavior = excluded.behavior, reason = excluded.reason, source = excluded.source, updated_at = excluded.updated_at",
          params: [crypto.randomUUID(), row.organization_id, row.locale, variantId, formatTenantLocalePath(row.path, row.locale), formatTenantLocalePath(path, row.locale), now, now],
        },
      ]
    : []
  const updateVariant: BatchQuery = {
    query: 'UPDATE content_documents SET path = ?, title = ?, summary = ?, seo_title = ?, seo_description = ?, canonical_url = ?, updated_by = ? WHERE id = ? AND organization_id = ?',
    params: [path, metadata.title, metadata.summary, metadata.seoTitle, metadata.seoDescription, metadata.canonicalUrl, input.userId, variantId, input.scope.organizationId],
  }
  const updatePage: BatchQuery = {
    query: `UPDATE content_documents SET metadata_json = json_set(metadata_json, '$.page_type', ?, '$.recipe', ?),
      sort_order = ?, updated_by = ?
      WHERE row_role = 'root' AND kind = 'page' AND id = ? AND organization_id = ? AND ? = 'en'`,
    params: [metadata.pageType, metadata.recipe, sortOrder, input.userId,
      row.page_id, input.scope.organizationId, row.locale],
  }
  await updateContentDocument(db, variantId, {
    blocks: blocksAsInputs(blocks), expected_updated_at: input.data.expectedUpdatedAt,
    additionalQueriesAfter: [...placementQueries, updateVariant, updatePage, ...redirectQueries, publicResourceCacheInvalidationQuery(input.scope.organizationId, 'tenant-page-update')],
  })
  if (row.path === '/' || path === '/') {
    // The homepage is represented by the site card. Refresh the site card only.
    await refreshSocialCard({ db, env: input.env, owner: { owner_type: 'organization', owner_id: input.scope.organizationId }, actorId: input.userId })
  } else {
    await refreshSocialCard({ db, env: input.env, owner: { owner_type: 'content_document', owner_id: variantId }, actorId: input.userId })
  }
  return { page: await getTenantPageForEditor(db, variantId, input.scope) }
}

export async function listPublishedTenantPagePaths(db: DbClient, organizationId: string, locale?: string | null) {
  const resolvedLocale = await resolveLocale(db, organizationId, locale)
  return await queryAll<{ id: string; path: string; title: string; summary: string | null; sort_order: number; updated_at: string }>(db, `
    SELECT v.id, v.path, v.title, v.summary, p.sort_order, v.updated_at
      FROM content_documents v JOIN content_documents p ON p.id = COALESCE(v.root_id, v.id)
     WHERE v.row_role IN ('root','representation') AND v.kind = 'page' AND v.organization_id = ? AND v.locale = ?
     ORDER BY v.path ASC
  `, [organizationId, resolvedLocale])
}

export async function getTenantPageById(db: DbClient, variantId: string, scope?: TenantPageScope) {
  return await getTenantPageForEditor(db, variantId, scope)
}

export async function getTenantPageForEditorByPath(db: DbClient, organizationId: string, path: string, locale?: string | null) {
  const resolvedLocale = await resolveLocale(db, organizationId, locale)
  const row = await queryFirst<{ id: string } | null>(db, `
    SELECT id FROM content_documents
     WHERE row_role IN ('root','representation') AND kind = 'page' AND organization_id = ? AND locale = ? AND path = ?
     LIMIT 1
  `, [organizationId, resolvedLocale, normalizeTenantPagePath(path)])
  if (!row) notFound('Tenant page variant not found')
  return await getTenantPageForEditor(db, row.id)
}
