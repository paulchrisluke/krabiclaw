import { assertCalendarDate, isValidTimezone, instantDate, localDateAt, addLocalDays } from '~/utils/timezone'
import { queryAll, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { isOrganizationWideRole, listAccessibleLocationIds } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'

export const AGENDA_KINDS = ['reservation', 'booking', 'post'] as const
export type AgendaKind = typeof AGENDA_KINDS[number]

export interface AgendaItem {
  id: string
  kind: AgendaKind
  startsAt: string
  endsAt: string | null
  dayKey: string
  timeZone: string
  showTimeZone: boolean
  title: string
  subtitle: string | null
  status: string
  siteId: string
  locationId: string | null
  locationTitle: string | null
  guestImageUrl: string | null
  resourceImageUrl: string | null
  resourceTitle: string | null
  partySize: number | null
  to: string
}

export interface TodayAgendaPayload extends AgendaPayload {
  resolvedAt: string
}

export interface AgendaPrincipal {
  env: CloudflareEnv
  memberId: string
  role: string
}

export interface AgendaQuery {
  from: string
  to: string
  siteId?: string
  locationId?: string
  kinds?: AgendaKind[]
  principal?: AgendaPrincipal
  organizationSlug?: string
}

export interface AgendaSite {
  id: string
  label: string
  slug: string
  vertical: string
}

export interface AgendaLocation {
  id: string
  siteId: string
  title: string
}

export interface AgendaPayload {
  items: AgendaItem[]
  availableKinds: AgendaKind[]
  sites: AgendaSite[]
  locations: AgendaLocation[]
}

interface SourceRow {
  id: string
  kind: AgendaKind
  starts_at: string | null
  ends_at: string | null
  title: string
  subtitle: string | null
  status: string
  site_id: string
  site_slug: string
  location_id: string | null
  location_slug: string | null
  location_title: string | null
  timezone: string | null
  guest_image_url: string | null
  resource_image_url: string | null
  resource_title: string | null
  party_size: number | null
}

interface CapabilitySiteRow {
  id: string
  brand_name: string | null
  subdomain: string | null
  vertical: string
  theme_id: string
  feature_overrides: string | null
}

interface LocationRow {
  id: string
  site_id: string
  title: string
}

function scopeParams(organizationId: string, query: AgendaQuery): unknown[] {
  const params: unknown[] = [organizationId]
  if (query.siteId) params.push(query.siteId)
  if (query.locationId) params.push(query.locationId)
  return params
}

function scopeConditions(query: AgendaQuery, alias: string): string {
  return [
    query.siteId ? `AND ${alias}.site_id = ?` : '',
    query.locationId ? `AND ${alias}.location_id = ?` : '',
  ].filter(Boolean).join('\n')
}

function mediaUrlSelect(
  alias: string,
  ownerType: 'business_location' | 'product' | 'content_document' | 'site',
  ownerId: string,
  slots: string[],
): string {
  const slotList = slots.map(slot => `'${slot}'`).join(', ')
  const slotOrder = slots.map((slot, index) => `WHEN '${slot}' THEN ${index}`).join(' ')
  return `(SELECT COALESCE(media_asset.thumbnail_url, media_asset.public_url)
    FROM media_placements placement
    JOIN media_assets media_asset
      ON media_asset.id = placement.asset_id
     AND media_asset.organization_id = placement.organization_id
     AND media_asset.site_id = placement.site_id
     AND media_asset.status = 'active'
    WHERE placement.organization_id = ${alias}.organization_id
      AND placement.site_id = ${alias}.site_id
      AND placement.owner_type = '${ownerType}'
      AND placement.owner_id = ${ownerId}
      AND placement.slot IN (${slotList})
      AND placement.status = 'active'
    ORDER BY CASE placement.slot ${slotOrder} ELSE ${slots.length} END, placement.sort_order
    LIMIT 1)`
}

function siteMediaUrlSelect(alias: string): string {
  return mediaUrlSelect(alias, 'site', `${alias}.site_id`, ['social_card', 'social_share', 'logo'])
}

function locationMediaUrlSelect(alias: string): string {
  return mediaUrlSelect(alias, 'business_location', `${alias}.location_id`, ['social_card', 'hero', 'gallery'])
}

export async function listAgenda(
  db: DbClient,
  organizationId: string,
  query: AgendaQuery,
): Promise<AgendaPayload> {
  assertCalendarDate(query.from)
  assertCalendarDate(query.to)
  if (query.from > query.to) throw new Error('from must not be after to')

  const scoped = Boolean(query.principal && !isOrganizationWideRole(query.principal.role))
  const allCapabilitySites = await queryAll<CapabilitySiteRow>(db, `
    SELECT s.id, s.brand_name, s.subdomain, s.vertical, s.theme_id, s.feature_overrides
    FROM sites s
    WHERE s.organization_id = ?
    ORDER BY s.created_at, s.id
  `, [organizationId])
  const accessibleLocationsBySite = new Map<string, string[] | null>()
  if (scoped && query.principal) {
    await Promise.all(allCapabilitySites.map(async (site) => {
      accessibleLocationsBySite.set(site.id, await listAccessibleLocationIds(db, {
        env: query.principal!.env,
        memberId: query.principal!.memberId,
        role: query.principal!.role,
        organizationId,
        siteId: site.id,
      }))
    }))
  }
  const capabilitySites = allCapabilitySites.filter(site =>
    !scoped || (accessibleLocationsBySite.get(site.id)?.length ?? 1) > 0)

  const available = new Set<AgendaKind>(['post'])
  for (const site of capabilitySites) {
    const { capabilities } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
      siteEnabledFeatures: site.feature_overrides,
    })
    const features = new Set([...capabilities.pages.map(page => page.feature), ...capabilities.managers.map(manager => manager.id)])
    if (features.has('reservations')) available.add('reservation')
    if (features.has('products')) available.add('booking')
  }
  const availableKinds = AGENDA_KINDS.filter(kind => available.has(kind))
  const requestedKinds = new Set((query.kinds?.length ? query.kinds : availableKinds).filter(kind => available.has(kind)))
  if (requestedKinds.size === 0) {
    return {
      items: [], availableKinds,
      sites: capabilitySites.map(site => ({ id: site.id, label: site.brand_name ?? site.subdomain ?? site.id, slug: site.subdomain ?? site.id, vertical: site.vertical })),
      locations: [],
    }
  }

  const sourceQueries: Promise<SourceRow[]>[] = []
  const broadFrom = `${addLocalDays(query.from, -2)}T00:00:00.000Z`
  const broadTo = `${addLocalDays(query.to, 2)}T23:59:59.999Z`
  const commonSelect = (alias: string, kind: AgendaKind, fields: string, enrichment: {
    joins?: string
    resourceImage?: string
    resourceTitle?: string
  } = {}) => `
    SELECT ${alias}.id, '${kind}' AS kind, ${fields}, ${alias}.site_id,
           COALESCE(s.subdomain, s.id) AS site_slug, ${alias}.location_id,
           l.slug AS location_slug, l.title AS location_title,
           CASE WHEN ${alias}.location_id IS NULL THEN json_extract(s.settings_json, '$.config.default_timezone') ELSE l.timezone END AS timezone,
           NULL AS guest_image_url,
           ${enrichment.resourceImage ?? `COALESCE(${locationMediaUrlSelect(alias)}, ${siteMediaUrlSelect(alias)})`} AS resource_image_url,
           ${enrichment.resourceTitle ?? 'COALESCE(l.title, s.brand_name, s.subdomain, s.id)'} AS resource_title
    FROM ${kind === 'post' ? 'content_documents' : 'requests'} ${alias}
    JOIN sites s ON s.id = ${alias}.site_id AND s.organization_id = ${alias}.organization_id
    LEFT JOIN business_locations l ON l.id = ${alias}.location_id AND l.site_id = ${alias}.site_id
    
    ${enrichment.joins ?? ''}
    WHERE ${kind === 'post' ? `${alias}.kind = 'social_post' AND ${alias}.row_role = 'root' AND ` : `${alias}.kind = '${kind}' AND `}${alias}.organization_id = ? ${scopeConditions(query, alias)}
  `
  const params = () => scopeParams(organizationId, query)

  // A held table and a booked seat are their own rows, and each states one
  // instant in its own zone. The window here is deliberately broad in UTC; the
  // day a row belongs to is decided below, in that row's zone.
  if (requestedKinds.has('reservation')) sourceQueries.push(queryAll(db, `${commonSelect('r', 'reservation', `agenda_reservation.starts_at, agenda_reservation.ends_at,
    json_extract(r.payload_json, '$.guest.name') AS title, printf('%d%s guests', agenda_reservation.party_size, CASE json_extract(r.payload_json, '$.party_size_is_minimum') WHEN 1 THEN '+' ELSE '' END) AS subtitle, agenda_reservation.party_size, agenda_reservation.status`, {
    joins: 'JOIN reservations agenda_reservation ON agenda_reservation.request_id = r.id',
  })} AND agenda_reservation.starts_at BETWEEN ? AND ?`, [...params(), broadFrom, broadTo]))
  if (requestedKinds.has('booking')) sourceQueries.push(queryAll(db, `${commonSelect('b', 'booking', `agenda_session.starts_at, agenda_session.ends_at,
    json_extract(b.payload_json, '$.guest.name') AS title, printf('%d guests', agenda_booking.party_size) AS subtitle, agenda_booking.party_size AS party_size, agenda_booking.status`, {
    joins: `JOIN bookings agenda_booking ON agenda_booking.request_id = b.id
      JOIN product_sessions agenda_session ON agenda_session.id = agenda_booking.product_session_id
      LEFT JOIN products agenda_product ON agenda_product.id = agenda_booking.product_id AND agenda_product.organization_id = agenda_booking.organization_id`,
    resourceImage: `COALESCE(${mediaUrlSelect('b', 'product', 'agenda_booking.product_id', ['gallery'])}, ${locationMediaUrlSelect('b')}, ${siteMediaUrlSelect('b')})`,
    resourceTitle: 'COALESCE(agenda_product.name, l.title, s.brand_name, s.subdomain, s.id)',
  })} AND agenda_session.starts_at BETWEEN ? AND ?`, [...params(), broadFrom, broadTo]))
  if (requestedKinds.has('post')) sourceQueries.push(queryAll(db, `${commonSelect('p', 'post', `CASE p.status WHEN 'published' THEN p.published_at WHEN 'scheduled' THEN p.scheduled_for END AS starts_at, NULL AS ends_at,
    NULLIF(COALESCE(NULLIF(p.title, ''), json_extract(p.metadata_json, '$.event.title')), '') AS title, json_extract(p.metadata_json, '$.post_type') AS subtitle, NULL AS party_size, p.status`, {
    resourceImage: `COALESCE(${mediaUrlSelect('p', 'content_document', 'p.id', ['cover'])}, ${locationMediaUrlSelect('p')}, ${siteMediaUrlSelect('p')})`,
  })}
    AND CASE p.status WHEN 'published' THEN p.published_at WHEN 'scheduled' THEN p.scheduled_for END BETWEEN ? AND ?`, [...params(), broadFrom, broadTo]))

  const rows = (await Promise.all(sourceQueries)).flat().filter((row) => {
    if (!scoped) return true
    const locationIds = accessibleLocationsBySite.get(row.site_id)
    return locationIds === null || Boolean(row.location_id && locationIds?.includes(row.location_id))
  })
  const organizationSlug = query.organizationSlug ?? organizationId
  const items = rows.flatMap<AgendaItem>((row) => {
    const timeZone = row.timezone
    if (!isValidTimezone(timeZone)) throw new Error(`Timezone is not configured for agenda item ${row.id}`)
    if (!row.starts_at) throw new Error(`Start time is missing for agenda item ${row.id}`)
    const startsAt = instantDate(row.starts_at).toISOString()
    const dayKey = localDateAt(instantDate(startsAt), timeZone)
    if (dayKey < query.from || dayKey > query.to) return []
    const siteBase = `/dashboard/${organizationSlug}/sites/${row.site_slug}`
    const locationSegment = row.location_slug ? `/locations/${row.location_slug}` : ''
    const to = row.kind === 'reservation' || row.kind === 'booking'
      ? `/dashboard/${organizationSlug}/bookings/${row.kind}/${encodeURIComponent(row.id)}`
      : `${siteBase}${locationSegment}/posts`
    return [{
      id: `${row.kind}:${row.id}`, kind: row.kind, startsAt,
      endsAt: row.ends_at === null ? null : instantDate(row.ends_at).toISOString(),
      dayKey, timeZone, showTimeZone: false, title: row.title,
      subtitle: row.subtitle, status: row.status, siteId: row.site_id,
      locationId: row.location_id, locationTitle: row.location_title,
      guestImageUrl: row.guest_image_url, resourceImageUrl: row.resource_image_url,
      resourceTitle: row.resource_title, partySize: row.party_size, to,
    }]
  }).sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id))

  const locationParams: unknown[] = [organizationId, d1JsonStringSet(capabilitySites.map(site => site.id))]
  const locations = capabilitySites.length === 0 ? [] : await queryAll<LocationRow>(db, `
    SELECT l.id, l.site_id, l.title FROM business_locations l
    WHERE l.organization_id = ? AND l.site_id IN (SELECT value FROM json_each(?))
    ORDER BY l.title, l.id
  `, locationParams).then(rows => rows.filter((location) => {
    if (!scoped) return true
    const locationIds = accessibleLocationsBySite.get(location.site_id)
    return locationIds === null || Boolean(locationIds?.includes(location.id))
  }))
  return {
    items, availableKinds,
    sites: capabilitySites.map(site => ({ id: site.id, label: site.brand_name ?? site.subdomain ?? site.id, slug: site.subdomain ?? site.id, vertical: site.vertical })),
    locations: locations.map(location => ({ id: location.id, siteId: location.site_id, title: location.title })),
  }
}

export async function listTodayAgenda(
  db: DbClient,
  organizationId: string,
  input: Pick<AgendaQuery, 'organizationSlug' | 'principal'>,
  now = new Date(),
): Promise<TodayAgendaPayload> {
  const utcKey = now.toISOString().slice(0, 10)
  const nearby = await listAgenda(db, organizationId, {
    from: addLocalDays(utcKey, -1),
    to: addLocalDays(utcKey, 1),
    kinds: ['reservation', 'booking'],
    organizationSlug: input.organizationSlug,
    principal: input.principal,
  })
  return {
    ...nearby,
    availableKinds: nearby.availableKinds.filter(kind => kind === 'reservation' || kind === 'booking'),
    items: nearby.items.filter(item => item.dayKey === todayKeyForTimeZone(now, item.timeZone)),
    resolvedAt: now.toISOString(),
  }
}

export function todayKeyForTimeZone(now: Date, timeZone: string): string {
  return localDateAt(now, timeZone)
}
