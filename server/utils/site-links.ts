import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { cleanString } from '~/server/utils/api-response'
import { resolvePublicTemplate, type PublicTemplateSlug } from '~/utils/template-registry'
import { getMediaPlacements } from '~/server/utils/media-placement'

const ROBOTS_DIRECTIVES = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'] as const
const LINK_ITEM_STATUSES = ['active', 'hidden'] as const

export type LinkItemStatus = typeof LINK_ITEM_STATUSES[number]
export type LinkPageRobots = typeof ROBOTS_DIRECTIVES[number]

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
  const robots = cleanString(value as ApiValue, 40) || 'noindex,follow'
  if (!ROBOTS_DIRECTIVES.includes(robots as LinkPageRobots)) {
    throw new SiteLinksValidationError('Robots must be one of the approved directives.')
  }
  return robots as LinkPageRobots
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
  const robots = required(row.robots, 'robots')
  if (!ROBOTS_DIRECTIVES.includes(robots as LinkPageRobots)) throw new SiteLinksValidationError('Stored links page robots directive is invalid.')
  return {
    id: required(row.id, 'id'),
    organization_id: required(row.organization_id, 'organization_id'),
    site_id: required(row.site_id, 'site_id'),
    path: required(row.path, 'path'),
    title: required(row.title, 'title'),
    robots: robots as LinkPageRobots,
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

export async function getLinksPage(db: DbClient, siteId: string): Promise<{ page: SiteLinksPage | null; items: SiteLinkItem[] }> {
  const pageRow = await queryFirst<ApiRecord>(db, `
    SELECT lp.*
      FROM site_link_pages lp
     WHERE lp.site_id = ?
     LIMIT 1
  `, [siteId])
  if (!pageRow) return { page: null, items: [] }

  const items = await queryAll<ApiRecord>(db, `
    SELECT li.*
      FROM site_link_items li
     WHERE li.link_page_id = ? AND li.site_id = ?
     ORDER BY li.sort_order ASC, li.created_at ASC
  `, [pageRow.id, siteId])

  return { page: mapPage(pageRow), items: items.map(mapItem) }
}

export async function getPublicLinksPage(db: DbClient, siteId: string): Promise<PublicSiteLinksPayload | null> {
  const site = await queryFirst<ApiRecord>(db, `
    SELECT s.id, s.organization_id, s.brand_name, s.brand_description,
           s.theme_id, s.vertical,
           cfg.value AS brand_color
      FROM sites s
      LEFT JOIN site_config cfg ON cfg.site_id = s.id AND cfg.key = 'brand_color'
     WHERE s.id = ? AND s.status = 'active' AND s.onboarding_status = 'active'
     LIMIT 1
  `, [siteId])
  if (!site) return null
  const media = await getMediaPlacements(db, { siteId, ownerType: 'site', ownerIds: [siteId] })

  const { page, items } = await getLinksPage(db, siteId)
  const publicItems = items.filter(item => item.status === 'active')
  if (!page || page.path !== '/links' || publicItems.length === 0) return null

  const template = resolvePublicTemplate({
    themeId: typeof site.theme_id === 'string' ? site.theme_id : null,
    vertical: typeof site.vertical === 'string' ? site.vertical : null,
  })

  return {
    site: {
      id: String(site.id),
      organization_id: String(site.organization_id),
      brand_name: typeof site.brand_name === 'string' ? site.brand_name : null,
      brand_description: typeof site.brand_description === 'string' ? site.brand_description : null,
      media: (media.get(siteId) ?? []).map(item => ({ asset_id: item.asset_id, slot: item.slot, public_url: item.public_url, thumbnail_url: item.thumbnail_url, kind: item.kind })),
      brand_color: typeof site.brand_color === 'string' ? site.brand_color : null,
      theme_id: typeof site.theme_id === 'string' ? site.theme_id : null,
      vertical: typeof site.vertical === 'string' ? site.vertical : null,
      template: template.slug,
    },
    page,
    items: publicItems,
  }
}

export async function upsertLinksPage(db: DbClient, input: {
  organizationId: string
  siteId: string
  page: LinksPageUpdateInput
  items: LinkItemUpdateInput[]
  updatedBy?: string | null
}) {
  const current = await getLinksPage(db, input.siteId)
  const pageId = current.page?.id || idWith('linkpage')
  const title = requiredString(input.page.title, 160, 'Title')
  const robots = normalizeRobots(input.page.robots)

  const normalizedItems = input.items.map((item, index) => {
    const existingId = cleanString(item.id as ApiValue, 120)
    const id = existingId && !existingId.startsWith('tmp_') ? existingId : idWith('linkitem')
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
      SELECT id FROM site_link_items
       WHERE id IN (SELECT value FROM json_each(?))
         AND (organization_id <> ? OR site_id <> ? OR link_page_id <> ?)
    `, [d1JsonStringSet(itemIds), input.organizationId, input.siteId, pageId])
    : []
  if (foreignIds.length) throw new SiteLinksValidationError('Link item IDs must belong to the current site.')

  const now = new Date().toISOString()
  const statements: BatchQuery[] = [{
    query: `
      INSERT INTO site_link_pages
        (id, organization_id, site_id, path, title, robots, seo_title, seo_description,
         created_at, updated_at, updated_by)
      VALUES (?, ?, ?, '/links', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(site_id) DO UPDATE SET
        title = excluded.title,
        robots = excluded.robots,
        seo_title = excluded.seo_title,
        seo_description = excluded.seo_description,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `,
    params: [
      pageId,
      input.organizationId,
      input.siteId,
      title,
      robots,
      nullableString(input.page.seo_title, 200),
      nullableString(input.page.seo_description, 500),
      now,
      now,
      input.updatedBy ?? null,
    ],
  }]

  if (itemIds.length) {
    statements.push({
      query: `
        DELETE FROM site_link_items
         WHERE organization_id = ? AND site_id = ? AND link_page_id = ?
           AND id NOT IN (SELECT value FROM json_each(?))
      `,
      params: [input.organizationId, input.siteId, pageId, d1JsonStringSet(itemIds)],
    })
  } else {
    statements.push({
      query: 'DELETE FROM site_link_items WHERE organization_id = ? AND site_id = ? AND link_page_id = ?',
      params: [input.organizationId, input.siteId, pageId],
    })
  }

  for (const item of normalizedItems) {
    statements.push({
      query: `
        INSERT INTO site_link_items
          (id, organization_id, site_id, link_page_id, label, destination, sort_order,
           status, created_at, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          destination = excluded.destination,
          sort_order = excluded.sort_order,
          status = excluded.status,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `,
      params: [
        item.id,
        input.organizationId,
        input.siteId,
        pageId,
        item.label,
        item.destination,
        item.sortOrder,
        item.status,
        now,
        now,
        input.updatedBy ?? null,
      ],
    })
  }

  await executeBatch(db, statements)
  return await getLinksPage(db, input.siteId)
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
  return await upsertLinksPage(db, { organizationId: input.organizationId, siteId: input.siteId, page: current.page, items: nextItems, updatedBy: input.updatedBy })
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
  return await upsertLinksPage(db, { organizationId: input.organizationId, siteId: input.siteId, page: current.page, items: nextItems, updatedBy: input.updatedBy })
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
    updatedBy: input.updatedBy,
  })
}

export async function recordLinkClick(db: DbClient, input: {
  organizationId: string
  siteId: string
  pagePath: string
  item: SiteLinkItem
  position: number
  ipHash?: string | null
  userAgent?: string | null
}) {
  const metadata = {
    link_item_id: input.item.id,
    link_label: input.item.label,
    position: input.position,
  }
  const id = idWith('conv')
  await execute(db, `
    INSERT INTO site_conversion_events
      (id, organization_id, site_id, event_name, page_type, page_path, cta_destination, metadata_json, ip_hash, user_agent)
    VALUES (?, ?, ?, 'link_click', 'links', ?, ?, ?, ?, ?)
  `, [
    id,
    input.organizationId,
    input.siteId,
    input.pagePath,
    input.item.destination,
    JSON.stringify(metadata),
    input.ipHash ?? null,
    input.userAgent ?? null,
  ])
  return { id }
}
