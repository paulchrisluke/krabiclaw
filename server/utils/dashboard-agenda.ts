import { assertCalendarDate, isValidTimezone, instantDate, localDateAt, addLocalDays } from '~/utils/timezone'
import { queryAll, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { resolveOrganizationCmsCapabilities } from '~/server/utils/cms-capabilities'
import type { ResolvedMembership } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'
import { CAPACITY_CONSUMING_SQL } from '~/shared/bookings'
import { loadOwnerPictures } from '~/server/notifications/hero'

export const AGENDA_KINDS = ['reservation', 'booking', 'session', 'post'] as const
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
  organizationId: string
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
  // The membership this request resolved, not loose fields: the scope reads
  // below authorize with it.
  membership: ResolvedMembership
}

export interface AgendaQuery {
  from: string
  to: string
  organizationId?: string
  locationId?: string
  kinds?: AgendaKind[]
  principal?: AgendaPrincipal
  organizationSlug?: string
}

export interface AgendaLocation {
  id: string
  organizationId: string
  title: string
}

export interface AgendaPayload {
  items: AgendaItem[]
  availableKinds: AgendaKind[]
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
  organization_id: string
  location_id: string | null
  location_slug: string | null
  location_title: string | null
  timezone: string | null
  guest_image_url: string | null
  picture_owner_type: PictureOwnerType
  picture_owner_id: string
  resource_title: string | null
  party_size: number | null
}

interface CapabilityOrganizationRow {
  id: string
  name: string | null
  subdomain: string | null
  vertical: string
  theme_id: string
  feature_overrides: string | null
}

interface LocationRow {
  id: string
  organization_id: string
  title: string
}

function scopeParams(organizationId: string, query: AgendaQuery): unknown[] {
  const params: unknown[] = [organizationId]
  if (query.organizationId) params.push(query.organizationId)
  if (query.locationId) params.push(query.locationId)
  return params
}

function scopeConditions(query: AgendaQuery, alias: string): string {
  return [
    query.organizationId ? `AND ${alias}.organization_id = ?` : '',
    query.locationId ? `AND ${alias}.location_id = ?` : '',
  ].filter(Boolean).join('\n')
}

// The picture an agenda row shows is its owner's, as resolveOwnerPicture
// answers it: a reservation's location, a booking's or class's experience, a
// post's own cover. The row names the owner; the resolver decides the picture.
type PictureOwnerType = 'business_location' | 'product' | 'content_document' | 'organization'

function locationPictureOwner(alias: string) {
  return {
    type: `CASE WHEN ${alias}.location_id IS NULL THEN 'organization' ELSE 'business_location' END`,
    id: `COALESCE(${alias}.location_id, ${alias}.organization_id)`,
  }
}

export async function listAgenda(
  db: DbClient,
  organizationId: string,
  query: AgendaQuery,
): Promise<AgendaPayload> {
  assertCalendarDate(query.from)
  assertCalendarDate(query.to)
  if (query.from > query.to) throw new Error('from must not be after to')

  const capabilityOrganizations = await queryAll<CapabilityOrganizationRow>(db, `
    SELECT s.id, s.name, s.subdomain, s.vertical, s.theme_id, s.feature_overrides
    FROM organization s
    WHERE s.id = ?
    ORDER BY s.id
  `, [organizationId])
  const available = new Set<AgendaKind>(['post'])
  for (const organization of capabilityOrganizations) {
    const { capabilities } = resolveOrganizationCmsCapabilities(organization.vertical, organization.theme_id, {
      organizationEnabledFeatures: organization.feature_overrides,
    })
    const features = new Set([...capabilities.pages.map(page => page.feature), ...capabilities.managers.map(manager => manager.id)])
    if (features.has('reservations')) available.add('reservation')
    if (features.has('products')) {
      available.add('booking')
      // A scheduled class is on the calendar whether or not anyone has booked
      // it yet: the merchant is looking for what runs, not only who is coming.
      available.add('session')
    }
  }
  const availableKinds = AGENDA_KINDS.filter(kind => available.has(kind))
  const requestedKinds = new Set((query.kinds?.length ? query.kinds : availableKinds).filter(kind => available.has(kind)))
  if (requestedKinds.size === 0) {
    return {
      items: [], availableKinds,
      locations: [],
    }
  }

  const sourceQueries: Promise<SourceRow[]>[] = []
  const broadFrom = `${addLocalDays(query.from, -2)}T00:00:00.000Z`
  const broadTo = `${addLocalDays(query.to, 2)}T23:59:59.999Z`
  const commonSelect = (alias: string, kind: AgendaKind, fields: string, enrichment: {
    joins?: string
    pictureOwner?: { type: string; id: string }
    resourceTitle?: string
  } = {}) => `
    SELECT ${alias}.id, '${kind}' AS kind, ${fields}, ${alias}.organization_id,
           ${alias}.location_id,
           l.slug AS location_slug, l.title AS location_title,
           CASE WHEN ${alias}.location_id IS NULL THEN json_extract(s.settings_json, '$.config.default_timezone') ELSE l.timezone END AS timezone,
           NULL AS guest_image_url,
           ${(enrichment.pictureOwner ?? locationPictureOwner(alias)).type} AS picture_owner_type,
           ${(enrichment.pictureOwner ?? locationPictureOwner(alias)).id} AS picture_owner_id,
           ${enrichment.resourceTitle ?? 'COALESCE(l.title, s.name, s.subdomain, s.id)'} AS resource_title
    FROM ${kind === 'post' ? 'content_documents' : 'requests'} ${alias}
    JOIN organization s ON s.id = ${alias}.organization_id
    LEFT JOIN business_locations l ON l.id = ${alias}.location_id AND l.organization_id = ${alias}.organization_id
    
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
    pictureOwner: { type: `'product'`, id: 'agenda_booking.product_id' },
    resourceTitle: 'COALESCE(agenda_product.name, l.title, s.name, s.subdomain, s.id)',
  })} AND agenda_session.starts_at BETWEEN ? AND ?`, [...params(), broadFrom, broadTo]))
  // The class itself: one row per scheduled session in the window, titled by
  // its product, with seats taken over seats offered. Cancelled sessions stay
  // out; a cancelled class is not something to arrive for.
  if (requestedKinds.has('session')) sourceQueries.push(queryAll(db, `
    SELECT agenda_session.id, 'session' AS kind, agenda_session.starts_at, agenda_session.ends_at,
           agenda_product.name AS title,
           CASE WHEN agenda_session.capacity IS NULL THEN printf('%d booked', COALESCE(agenda_claimed.claimed, 0))
                ELSE printf('%d of %d booked', COALESCE(agenda_claimed.claimed, 0), agenda_session.capacity) END AS subtitle,
           agenda_session.capacity AS party_size, agenda_session.status,
           pub.organization_id, agenda_session.location_id,
           l.slug AS location_slug, l.title AS location_title,
           agenda_session.timezone AS timezone,
           NULL AS guest_image_url,
           'product' AS picture_owner_type, agenda_session.product_id AS picture_owner_id,
           agenda_product.name AS resource_title
    FROM product_sessions agenda_session
    JOIN products agenda_product ON agenda_product.id = agenda_session.product_id AND agenda_product.organization_id = agenda_session.organization_id
    LEFT JOIN business_locations l ON l.id = agenda_session.location_id
    JOIN product_publications pub ON pub.product_id = agenda_session.product_id AND pub.organization_id = agenda_session.organization_id
      AND pub.published = 1 AND (agenda_session.location_id IS NULL OR pub.organization_id = l.organization_id)
    JOIN organization s ON s.id = pub.organization_id
    LEFT JOIN (SELECT b.product_session_id, SUM(b.party_size) AS claimed FROM bookings b WHERE ${CAPACITY_CONSUMING_SQL} GROUP BY b.product_session_id) agenda_claimed
      ON agenda_claimed.product_session_id = agenda_session.id
    WHERE agenda_session.organization_id = ? AND agenda_session.status = 'scheduled'
      ${query.organizationId ? 'AND pub.organization_id = ?' : ''}
      ${query.locationId ? 'AND agenda_session.location_id = ?' : ''}
      AND agenda_session.starts_at BETWEEN ? AND ?
  `, [...params(), broadFrom, broadTo]))
  if (requestedKinds.has('post')) sourceQueries.push(queryAll(db, `${commonSelect('p', 'post', `CASE p.status WHEN 'published' THEN p.published_at WHEN 'scheduled' THEN p.scheduled_for END AS starts_at, NULL AS ends_at,
    NULLIF(COALESCE(NULLIF(p.title, ''), json_extract(p.metadata_json, '$.event.title')), '') AS title, json_extract(p.metadata_json, '$.post_type') AS subtitle, NULL AS party_size, p.status`, {
    pictureOwner: { type: `'content_document'`, id: 'p.id' },
  })}
    AND CASE p.status WHEN 'published' THEN p.published_at WHEN 'scheduled' THEN p.scheduled_for END BETWEEN ? AND ?`, [...params(), broadFrom, broadTo]))

  const rows = (await Promise.all(sourceQueries)).flat()
  const pictureOwnerTypes = [...new Set(rows.map(row => row.picture_owner_type))]
  const pictures = new Map((await Promise.all(pictureOwnerTypes.map(async ownerType => [
    ownerType,
    await loadOwnerPictures(db, organizationId, ownerType, rows.filter(row => row.picture_owner_type === ownerType).map(row => row.picture_owner_id)),
  ] as const))))
  const organizationSlug = query.organizationSlug ?? organizationId
  const items = rows.flatMap<AgendaItem>((row) => {
    const timeZone = row.timezone
    if (!isValidTimezone(timeZone)) throw new Error(`Timezone is not configured for agenda item ${row.id}`)
    if (!row.starts_at) throw new Error(`Start time is missing for agenda item ${row.id}`)
    const startsAt = instantDate(row.starts_at).toISOString()
    const dayKey = localDateAt(instantDate(startsAt), timeZone)
    if (dayKey < query.from || dayKey > query.to) return []
    const organizationBase = `/dashboard/${organizationSlug}`
    const locationSegment = row.location_slug ? `/locations/${row.location_slug}` : ''
    const to = row.kind === 'reservation' || row.kind === 'booking'
      ? `/dashboard/${organizationSlug}/bookings/${row.kind}/${encodeURIComponent(row.id)}`
      : row.kind === 'session'
        ? `${organizationBase}${locationSegment}/products`
        : `${organizationBase}${locationSegment}/posts`
    return [{
      id: `${row.kind}:${row.id}`, kind: row.kind, startsAt,
      endsAt: row.ends_at === null ? null : instantDate(row.ends_at).toISOString(),
      dayKey, timeZone, showTimeZone: false, title: row.title,
      subtitle: row.subtitle, status: row.status, organizationId: row.organization_id,
      locationId: row.location_id, locationTitle: row.location_title,
      guestImageUrl: row.guest_image_url,
      resourceImageUrl: pictures.get(row.picture_owner_type)?.get(row.picture_owner_id)?.imageUrl ?? null,
      resourceTitle: row.resource_title, partySize: row.party_size, to,
    }]
  }).sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id))

  const locationParams: unknown[] = [organizationId, d1JsonStringSet(capabilityOrganizations.map(organization => organization.id))]
  const locations = capabilityOrganizations.length === 0 ? [] : await queryAll<LocationRow>(db, `
    SELECT l.id, l.organization_id, l.title FROM business_locations l
    WHERE l.organization_id = ? AND l.organization_id IN (SELECT value FROM json_each(?))
    ORDER BY l.title, l.id
  `, locationParams)
  return {
    items, availableKinds,
    locations: locations.map(location => ({ id: location.id, organizationId: location.organization_id, title: location.title })),
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
