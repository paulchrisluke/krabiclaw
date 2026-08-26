import { queryAll, type DbClient } from '~/server/db'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { isOrganizationWideRole, listAccessibleLocationIds } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'

export const AGENDA_KINDS = ['reservation', 'experience_booking', 'post', 'thread'] as const
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
  to: string
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
  threadState?: 'needs_attention' | 'waiting_on_guest' | 'resolved'
  limit?: number
}

export interface AgendaSite {
  id: string
  label: string
  slug: string
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
  local_date: string | null
  local_time: string | null
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
  thread_id: string | null
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

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function assertDateKey(value: string, name: string): void {
  if (!DATE_KEY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${name} must be a YYYY-MM-DD date`)
  }
}

function validTimeZone(value: string | null): string | null {
  if (!value) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
    return value
  } catch {
    return null
  }
}

function datePartsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? 0)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') }
}

function localDateTimeToIso(dateKey: string, time: string | null, timeZone: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hour, minute, second] = (time ?? '00:00:00').split(':').map(Number)
  const desiredUtc = Date.UTC(year!, month! - 1, day!, hour || 0, minute || 0, second || 0)
  let instant = desiredUtc
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = datePartsInZone(new Date(instant), timeZone)
    const representedUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    const correction = desiredUtc - representedUtc
    instant += correction
    if (correction === 0) break
  }
  return new Date(instant).toISOString()
}

function dayKeyInZone(iso: string, timeZone: string): string {
  const parts = datePartsInZone(new Date(iso), timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
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

export async function listAgenda(
  db: DbClient,
  organizationId: string,
  query: AgendaQuery,
): Promise<AgendaPayload> {
  assertDateKey(query.from, 'from')
  assertDateKey(query.to, 'to')
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

  const available = new Set<AgendaKind>(['post', 'thread'])
  for (const site of capabilitySites) {
    const { capabilities } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
      siteEnabledFeatures: site.feature_overrides,
    })
    const features = new Set([...capabilities.pages.map(page => page.feature), ...capabilities.managers.map(manager => manager.id)])
    if (features.has('reservations')) available.add('reservation')
    if (features.has('experiences') || features.has('experience_bookings')) available.add('experience_booking')
  }
  const availableKinds = AGENDA_KINDS.filter(kind => available.has(kind))
  const requestedKinds = new Set((query.kinds?.length ? query.kinds : availableKinds).filter(kind => available.has(kind)))
  if (requestedKinds.size === 0) {
    return {
      items: [], availableKinds,
      sites: capabilitySites.map(site => ({ id: site.id, label: site.brand_name ?? site.subdomain ?? site.id, slug: site.subdomain ?? site.id })),
      locations: [],
    }
  }

  const sourceQueries: Promise<SourceRow[]>[] = []
  const broadFrom = `${addDays(query.from, -2)}T00:00:00.000Z`
  const broadTo = `${addDays(query.to, 2)}T23:59:59.999Z`
  const commonSelect = (alias: string, kind: AgendaKind, fields: string) => `
    SELECT ${alias}.id, '${kind}' AS kind, ${fields}, ${alias}.site_id,
           COALESCE(s.subdomain, s.id) AS site_slug, ${alias}.location_id,
           l.slug AS location_slug, l.title AS location_title,
           COALESCE(l.timezone, primary_location.timezone) AS timezone, gt.id AS thread_id
    FROM ${kind === 'reservation' ? 'reservation_submissions' : kind === 'experience_booking' ? 'experience_bookings' : kind === 'post' ? 'posts' : 'guest_threads'} ${alias}
    JOIN sites s ON s.id = ${alias}.site_id AND s.organization_id = ${alias}.organization_id
    LEFT JOIN business_locations l ON l.id = ${alias}.location_id AND l.site_id = ${alias}.site_id
    LEFT JOIN business_locations primary_location ON primary_location.id = s.primary_location_id AND primary_location.site_id = s.id
    ${kind === 'thread' ? '' : `LEFT JOIN guest_threads gt ON gt.submission_type = '${kind}' AND gt.submission_id = ${alias}.id`}
    ${kind === 'thread' ? 'LEFT JOIN guest_threads gt ON gt.id = ' + alias + '.id' : ''}
    WHERE ${alias}.organization_id = ? ${scopeConditions(query, alias)}
  `
  const params = () => scopeParams(organizationId, query)

  if (requestedKinds.has('reservation')) sourceQueries.push(queryAll(db, `${commonSelect('r', 'reservation', `r.date AS local_date, r.time AS local_time, NULL AS starts_at, NULL AS ends_at,
    r.name AS title, printf('%s guests', r.guests) AS subtitle, r.status`)} AND r.date BETWEEN ? AND ?`, [...params(), query.from, query.to]))
  if (requestedKinds.has('experience_booking')) sourceQueries.push(queryAll(db, `${commonSelect('b', 'experience_booking', `b.booking_date AS local_date, b.time_slot AS local_time, NULL AS starts_at, NULL AS ends_at,
    b.guest_name AS title, printf('%d guests · %s', b.party_size, b.time_slot) AS subtitle, b.status`)} AND b.booking_date BETWEEN ? AND ?`, [...params(), query.from, query.to]))
  if (requestedKinds.has('post')) sourceQueries.push(queryAll(db, `${commonSelect('p', 'post', `NULL AS local_date, NULL AS local_time, CASE WHEN p.status = 'published' AND p.published_at IS NOT NULL THEN p.published_at ELSE COALESCE(p.scheduled_for, p.published_at, p.event_start) END AS starts_at, p.event_end AS ends_at,
    NULLIF(COALESCE(NULLIF(p.title, ''), NULLIF(p.event_title, '')), '') AS title, p.post_type AS subtitle, p.status`)}
    AND CASE WHEN p.status = 'published' AND p.published_at IS NOT NULL THEN p.published_at ELSE COALESCE(p.scheduled_for, p.published_at, p.event_start) END BETWEEN ? AND ?`, [...params(), broadFrom, broadTo]))
  if (requestedKinds.has('thread')) sourceQueries.push(queryAll(db, `${commonSelect('t', 'thread', `NULL AS local_date, NULL AS local_time, COALESCE(t.last_inbound_at, t.last_message_at, t.created_at) AS starts_at, NULL AS ends_at,
    t.guest_name AS title, t.submission_type AS subtitle, t.conversation_state AS status`)}
    AND COALESCE(t.last_inbound_at, t.last_message_at, t.created_at) BETWEEN ? AND ?
    ${query.threadState ? 'AND t.conversation_state = ?' : ''}
    ORDER BY COALESCE(t.last_inbound_at, t.last_message_at, t.created_at) DESC
    ${query.limit ? 'LIMIT ?' : ''}`, [
      ...params(), broadFrom, broadTo,
      ...(query.threadState ? [query.threadState] : []),
      ...(query.limit ? [Math.max(1, Math.min(query.limit, 100))] : []),
    ]))

  const rows = (await Promise.all(sourceQueries)).flat().filter((row) => {
    if (!scoped) return true
    const locationIds = accessibleLocationsBySite.get(row.site_id)
    return locationIds === null || Boolean(row.location_id && locationIds?.includes(row.location_id))
  })
  const organizationSlug = query.organizationSlug ?? organizationId
  const items = rows.flatMap<AgendaItem>((row) => {
    const timeZone = validTimeZone(row.timezone) ?? 'UTC'
    const startsAt = row.local_date
      ? localDateTimeToIso(row.local_date, row.local_time, timeZone)
      : row.starts_at && !Number.isNaN(Date.parse(row.starts_at)) ? new Date(row.starts_at).toISOString() : ''
    if (!startsAt) return []
    const dayKey = row.local_date ?? dayKeyInZone(startsAt, timeZone)
    if (dayKey < query.from || dayKey > query.to) return []
    const siteBase = `/dashboard/${organizationSlug}/sites/${row.site_slug}`
    const locationSegment = row.location_slug ? `/locations/${row.location_slug}` : ''
    const to = row.thread_id
      ? `${siteBase}/conversations/${row.thread_id}`
      : row.kind === 'post'
        ? `${siteBase}${locationSegment}/posts`
        : `${siteBase}/conversations`
    return [{
      id: `${row.kind}:${row.id}`, kind: row.kind, startsAt,
      endsAt: row.ends_at && !Number.isNaN(Date.parse(row.ends_at)) ? new Date(row.ends_at).toISOString() : null,
      dayKey, timeZone, showTimeZone: !validTimeZone(row.timezone), title: row.title,
      subtitle: row.subtitle, status: row.status, siteId: row.site_id,
      locationId: row.location_id, locationTitle: row.location_title, to,
    }]
  }).sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id))

  const locationParams: unknown[] = [organizationId, ...capabilitySites.map(site => site.id)]
  const locations = capabilitySites.length === 0 ? [] : await queryAll<LocationRow>(db, `
    SELECT l.id, l.site_id, l.title FROM business_locations l
    WHERE l.organization_id = ? AND l.site_id IN (${capabilitySites.map(() => '?').join(', ')})
    ORDER BY l.title, l.id
  `, locationParams).then(rows => rows.filter((location) => {
    if (!scoped) return true
    const locationIds = accessibleLocationsBySite.get(location.site_id)
    return locationIds === null || Boolean(locationIds?.includes(location.id))
  }))
  return {
    items, availableKinds,
    sites: capabilitySites.map(site => ({ id: site.id, label: site.brand_name ?? site.subdomain ?? site.id, slug: site.subdomain ?? site.id })),
    locations: locations.map(location => ({ id: location.id, siteId: location.site_id, title: location.title })),
  }
}

export function todayKeyForTimeZone(now: Date, timeZone: string): string {
  return dayKeyInZone(now.toISOString(), validTimeZone(timeZone) ?? 'UTC')
}
