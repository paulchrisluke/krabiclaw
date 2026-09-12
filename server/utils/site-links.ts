import { assertPublicSiteLanguageEntitlement, getPersistedSourceLocale } from '~/server/utils/localization'
import { createContentDocumentWithBlocks, updateContentDocument } from '~/server/utils/content/documents'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { cleanString } from '~/server/utils/api-response'
import { resolvePublicTemplate, type PublicTemplateSlug } from '~/utils/template-registry'
import { getMediaPlacements } from '~/server/utils/media-placement'
import { loadExactPublicLocalizations, projectExactLocalizedResource } from '~/server/utils/public-localization'
import { listPublicLocaleRepresentations } from '~/server/utils/public-locale-representations'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'
import { parseRobotsIntent, type RobotsIntent } from '~/shared/robots-directive'

const LINK_ITEM_STATUSES = ['active', 'hidden'] as const

export type LinkItemStatus = typeof LINK_ITEM_STATUSES[number]
export type LinkPageRobots = RobotsIntent

export interface SiteLinksPage {
  id: string
  organization_id: string
  site_id: string
  path: string
  title: string
  robots: LinkPageRobots
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface SiteLinkItem {
  id: string
  organization_id: string
  site_id: string
  link_page_id: string
  label: string
  destination: string
  sort_order: number
  status: LinkItemStatus
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface PublicSiteLinksPayload {
  site: {
    id: string
    organization_id: string
    brand_name: string | null
    brand_description: string | null
    media: Array<{ asset_id: string; slot: string; public_url: string | null; thumbnail_url: string | null; kind: string | null }>
    brand_color: string | null
    theme_id: string | null
    vertical: string | null
    template: PublicTemplateSlug
  }
  page: SiteLinksPage
  items: SiteLinkItem[]
  localeRepresentations: PublicLocaleRepresentation[]
}

export interface LinksPageUpdateInput {
  title?: unknown
  robots?: unknown
  seo_title?: unknown
  seo_description?: unknown
}

export interface LinkItemUpdateInput {
  id?: unknown
  label?: unknown
  destination?: unknown
  sort_order?: unknown
  status?: unknown
}

export class SiteLinksValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SiteLinksValidationError'
  }
}

function idWith(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

function nullableString(value: unknown, maxLength: number) {
  const cleaned = cleanString(value as ApiValue, maxLength)
  return cleaned || null
}

function requiredString(value: unknown, maxLength: number, field: string) {
  const cleaned = cleanString(value as ApiValue, maxLength)
  if (!cleaned) throw new SiteLinksValidationError(`${field} is required.`)
  return cleaned
}

function normalizeItemStatus(value: unknown): LinkItemStatus {
  const status = cleanString(value as ApiValue, 30)
  if (!status) throw new SiteLinksValidationError('Link status is required.')
  if (!LINK_ITEM_STATUSES.includes(status as LinkItemStatus)) {
    throw new SiteLinksValidationError('Link status must be active or hidden.')
  }
  return status as LinkItemStatus
}

function normalizeRobots(value: unknown): LinkPageRobots {
  const parsed = parseRobotsIntent(cleanString(value as ApiValue, 40))
  if (!parsed.ok) throw new SiteLinksValidationError('Robots must be one of the approved directives.')
  return parsed.intent ?? 'noindex,follow'
}

export function validateLinkDestination(value: unknown): string {
  const destination = requiredString(value, 2048, 'Destination')

  if (destination.startsWith('//') || destination.includes('\\')) {
    throw new SiteLinksValidationError('Destination must be a rooted path or a valid http(s), mailto, or tel URL.')
  }

  if (destination.startsWith('/')) {
    return destination
  }

  let parsed: URL
  try {
    parsed = new URL(destination)
  } catch {
    throw new SiteLinksValidationError('Destination must be a rooted path or a valid http(s), mailto, or tel URL.')
  }

  if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
    throw new SiteLinksValidationError('Destination scheme is not supported.')
  }

  return parsed.toString()
}

function mapPage(row: ApiRecord): SiteLinksPage {
  const required = (value: unknown, field: string) => {
    if (typeof value !== 'string' || !value.trim()) throw new SiteLinksValidationError(`Stored links page ${field} is invalid.`)
    return value
  }
  const parsedRobots = parseRobotsIntent(required(row.robots, 'robots'))
  if (!parsedRobots.ok || !parsedRobots.intent) throw new SiteLinksValidationError('Stored links page robots directive is invalid.')
  const robots = parsedRobots.intent
  return {
    id: required(row.id, 'id'),
    organization_id: required(row.organization_id, 'organization_id'),
    site_id: required(row.site_id, 'site_id'),
    path: required(row.path, 'path'),
    title: required(row.title, 'title'),
    robots,
    seo_title: typeof row.seo_title === 'string' ? row.seo_title : null,
    seo_description: typeof row.seo_description === 'string' ? row.seo_description : null,
    created_at: required(row.created_at, 'created_at'),
    updated_at: required(row.updated_at, 'updated_at'),
    updated_by: typeof row.updated_by === 'string' ? row.updated_by : null,
  }
}

function mapItem(row: ApiRecord): SiteLinkItem {
  const required = (value: unknown, field: string) => {
    if (typeof value !== 'string' || !value.trim()) throw new SiteLinksValidationError(`Stored link ${field} is invalid.`)
    return value
  }
  const status = required(row.status, 'status')
  if (!LINK_ITEM_STATUSES.includes(status as LinkItemStatus)) throw new SiteLinksValidationError('Stored link status is invalid.')
  const sortOrder = Number(row.sort_order)
  if (!Number.isInteger(sortOrder)) throw new SiteLinksValidationError('Stored link sort order is invalid.')
  return {
    id: required(row.id, 'id'),
    organization_id: required(row.organization_id, 'organization_id'),
    site_id: required(row.site_id, 'site_id'),
    link_page_id: required(row.link_page_id, 'link_page_id'),
    label: required(row.label, 'label'),
    destination: required(row.destination, 'destination'),
    sort_order: sortOrder,
    status: status as LinkItemStatus,
    created_at: required(row.created_at, 'created_at'),
    updated_at: required(row.updated_at, 'updated_at'),
    updated_by: typeof row.updated_by === 'string' ? row.updated_by : null,
  }
}

export function defaultLinksPage(input: { organizationId: string; siteId: string; brandName?: string | null }): SiteLinksPage {
  const now = new Date().toISOString()
  return {
    id: '',
    organization_id: input.organizationId,
    site_id: input.siteId,
    path: '/links',
    title: input.brandName || 'Links',
    robots: 'noindex,follow',
    seo_title: null,
    seo_description: null,
    created_at: now,
    updated_at: now,
    updated_by: null,
  }
}

export async function getLinksPage(db: DbClient, siteId: string, locale = 'en'): Promise<{ page: SiteLinksPage | null; items: SiteLinkItem[] }> {
  const pageRow = await queryFirst<ApiRecord>(db, `
    SELECT d.id, d.organization_id, d.site_id, d.path, d.title, root.robots, d.seo_title,
           d.seo_description, d.created_at, d.updated_at, d.updated_by
      FROM content_documents d JOIN content_documents root ON root.id = COALESCE(d.root_id, d.id)
     WHERE d.site_id = ? AND d.locale = ? AND root.kind = 'page' AND root.row_role = 'root'
       AND (root.metadata_json ->> '$.recipe') = 'links'
     LIMIT 1
  `, [siteId, locale])
  if (!pageRow) return { page: null, items: [] }
  const items = await queryAll<ApiRecord>(db, `
    SELECT b.id, d.organization_id, d.site_id, d.id AS link_page_id,
           (b.data_json ->> '$.label') AS label, (source.data_json ->> '$.url') AS destination,
           source.position AS sort_order, (source.data_json ->> '$.status') AS status,
           b.created_at, b.updated_at, d.updated_by
      FROM content_blocks b JOIN content_documents d ON d.id = b.document_id
      JOIN content_blocks source ON source.id = COALESCE(b.source_block_id,b.id)
     WHERE b.document_id = ? AND d.site_id = ? AND b.type = 'cta'
     ORDER BY source.position, b.created_at
  `, [pageRow.id, siteId])

  return { page: mapPage(pageRow), items: items.map(mapItem) }
}

export async function getPublicLinksPage(db: DbClient, siteId: string, locale = 'en'): Promise<PublicSiteLinksPayload | null> {
  const site = await queryFirst<ApiRecord>(db, `
    SELECT s.id, s.organization_id, s.brand_name, s.brand_description,
           s.theme_id, s.vertical,
           (s.settings_json ->> '$.config.brand_color') AS brand_color
      FROM sites s
     WHERE s.id = ? AND s.status = 'active' AND s.onboarding_status = 'active'
     LIMIT 1
  `, [siteId])
  if (!site) return null
  const media = await getMediaPlacements(db, { siteId, ownerType: 'site', ownerIds: [siteId] })

  await assertPublicSiteLanguageEntitlement(db, String(site.organization_id), siteId, locale)
  const { page: sourcePage } = await getLinksPage(db, siteId)
  const { page, items } = await getLinksPage(db, siteId, locale)
  const publicItems = items.filter(item => item.status === 'active')
  if (!sourcePage || !page || publicItems.length === 0) return null
  const organizationId = String(site.organization_id)
  const sourceLocale = await getPersistedSourceLocale(db, organizationId, siteId)
  const isSourceLocale = locale === sourceLocale.locale
  const localizations = isSourceLocale
    ? []
    : await loadExactPublicLocalizations(db, organizationId, siteId, locale)
  const siteLocalization = localizations.find(item => item.resourceType === 'site' && item.resourceId === siteId)
  const localizedSite = siteLocalization
    ? projectExactLocalizedResource('site', { ...site, id: siteId }, siteLocalization)
    : isSourceLocale ? site : { ...site, brand_name: null, brand_description: null }

  const template = resolvePublicTemplate({
    themeId: typeof site.theme_id === 'string' ? site.theme_id : null,
    vertical: typeof site.vertical === 'string' ? site.vertical : null,
  })

  return {
    site: {
      id: String(site.id),
      organization_id: String(site.organization_id),
      brand_name: typeof localizedSite.brand_name === 'string' ? localizedSite.brand_name : null,
      brand_description: typeof localizedSite.brand_description === 'string' ? localizedSite.brand_description : null,
      media: (media.get(siteId) ?? []).map(item => ({ asset_id: item.asset_id, slot: item.slot, public_url: item.public_url, thumbnail_url: item.thumbnail_url, kind: item.kind })),
      brand_color: typeof site.brand_color === 'string' ? site.brand_color : null,
      theme_id: typeof site.theme_id === 'string' ? site.theme_id : null,
      vertical: typeof site.vertical === 'string' ? site.vertical : null,
      template: template.slug,
    },
    page,
    items: publicItems,
    localeRepresentations: await listPublicLocaleRepresentations(db, {
      organizationId,
      siteId,
      sourcePath: '/links',
      documentId: sourcePage.id,
    }),
  }
}

export async function upsertLinksPage(db: DbClient, input: {
  organizationId: string
  siteId: string
  page: LinksPageUpdateInput
  items: LinkItemUpdateInput[]
  updatedBy?: string | null
  expectedUpdatedAt?: string
}) {
  const current = await getLinksPage(db, input.siteId)
  const pageId = current.page?.id || idWith('linkpage')
  const title = requiredString(input.page.title, 160, 'Title')
  const robots = normalizeRobots(input.page.robots)

  const knownItemIds = new Set(current.items.map(item => item.id))
  const createdItemIds: string[] = []
  const normalizedItems = input.items.map((item, index) => {
    const existingId = cleanString(item.id as ApiValue, 120)
    const id = existingId && knownItemIds.has(existingId) ? existingId : idWith('linkitem')
    if (id !== existingId) createdItemIds.push(id)
    const status = normalizeItemStatus(item.status)
    const sortOrder = Number(item.sort_order ?? index)
    if (!Number.isInteger(sortOrder)) throw new SiteLinksValidationError('Link sort order must be an integer.')
    return {
      id,
      label: requiredString(item.label, 120, 'Link label'),
      destination: validateLinkDestination(item.destination),
      sortOrder,
      status,
    }
  })

  const itemIds = normalizedItems.map(item => item.id)
  if (new Set(itemIds).size !== itemIds.length) throw new SiteLinksValidationError('Link item IDs must be unique.')

  const foreignIds = itemIds.length
    ? await queryAll<{ id: string }>(db, `
      SELECT b.id FROM content_blocks b JOIN content_documents d ON d.id = b.document_id
       WHERE b.id IN (SELECT value FROM json_each(?))
         AND (d.organization_id <> ? OR d.site_id <> ? OR b.document_id <> ?)
    `, [d1JsonStringSet(itemIds), input.organizationId, input.siteId, pageId])
    : []
  if (foreignIds.length) throw new SiteLinksValidationError('Link item IDs must belong to the current site.')

  const blocks = normalizedItems.sort((a, b) => a.sortOrder - b.sortOrder).map(item => ({
    id: item.id, type: 'cta' as const, data: { label: item.label, url: item.destination,
      status: item.status, updated_by: input.updatedBy ?? null },
  }))
  const copy = { title, robots, seo_title: nullableString(input.page.seo_title, 200),
    seo_description: nullableString(input.page.seo_description, 500), updated_by: input.updatedBy ?? null }
  if (current.page) {
    await updateContentDocument(db, current.page.id, { expected_updated_at: input.expectedUpdatedAt ?? current.page.updated_at,
      changes: copy, blocks })
  } else {
    await createContentDocumentWithBlocks(db, { id: pageId, organizationId: input.organizationId, siteId: input.siteId,
      kind: 'page', rowRole: 'root', locale: 'en', path: '/links', title, robots,
      seoTitle: copy.seo_title, seoDescription: copy.seo_description, updatedBy: input.updatedBy,
      metadata: { recipe: 'links', page_type: 'custom' } }, blocks)
  }
  return { ...await getLinksPage(db, input.siteId), created_item_ids: createdItemIds }
}

export async function createLinkItem(db: DbClient, input: {
  organizationId: string
  siteId: string
  linkPageId: string
  item: LinkItemUpdateInput
  updatedBy?: string | null
}) {
  const current = await getLinksPage(db, input.siteId)
  if (!current.page || current.page.id !== input.linkPageId) throw new SiteLinksValidationError('Links page not found.')
  const nextItems = [...current.items, { ...input.item, sort_order: current.items.length }]
  return await upsertLinksPage(db, { organizationId: input.organizationId, siteId: input.siteId, page: current.page, items: nextItems, updatedBy: input.updatedBy, expectedUpdatedAt: current.page.updated_at })
}

export async function updateLinkItem(db: DbClient, input: {
  organizationId: string
  siteId: string
  itemId: string
  updates: LinkItemUpdateInput
  updatedBy?: string | null
}) {
  const current = await getLinksPage(db, input.siteId)
  if (!current.page) throw new SiteLinksValidationError('Links page not found.')
  const nextItems = current.items.map(item => item.id === input.itemId ? { ...item, ...input.updates, id: item.id } : item)
  if (!nextItems.some(item => item.id === input.itemId)) throw new SiteLinksValidationError('Link item not found.')
  return await upsertLinksPage(db, { organizationId: input.organizationId, siteId: input.siteId, page: current.page, items: nextItems, updatedBy: input.updatedBy, expectedUpdatedAt: current.page.updated_at })
}

export async function deleteLinkItem(db: DbClient, input: {
  organizationId: string
  siteId: string
  itemId: string
  updatedBy?: string | null
}) {
  const current = await getLinksPage(db, input.siteId)
  if (!current.page) throw new SiteLinksValidationError('Links page not found.')
  return await upsertLinksPage(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    page: current.page,
    items: current.items.filter(item => item.id !== input.itemId),
    expectedUpdatedAt: current.page.updated_at,
    updatedBy: input.updatedBy,
  })
}
