import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import {
  isOrganizationWideRole,
  isScopedRole,
  listAccessibleLocationIds,
} from '~/server/utils/member-access'
import { CONVERSATION_STATE_LABELS } from './types'
import type {
  ConversationState,
  GuestThreadListItemViewModel,
  GuestThreadRow,
  ListGuestThreadsOptions,
} from './types'
import { formatOperationalStatusLabel, formatThreadWhenLabel } from './status-labels'

const SOURCE_GUEST_NAME_SQL = "json_extract(gt.payload_json, '$.guest.name')"
const SOURCE_GUEST_EMAIL_SQL = "json_extract(gt.payload_json, '$.guest.email')"
const SOURCE_GUEST_PHONE_SQL = "json_extract(gt.payload_json, '$.guest.phone')"
/**
 * The operational record a thread refers to.
 *
 * A thread carries no time, party size or status of its own any more, so the
 * inbox reads them from the booking or reservation that links back to it. A
 * thread with no record yields NULLs, and the surface says the thread has no
 * booking rather than printing a fabricated slot.
 */
const OPERATIONAL_RECORD_SQL = `
  LEFT JOIN (
    SELECT b.request_id, b.status, b.party_size, s.starts_at, s.timezone
      FROM bookings b JOIN product_sessions s ON s.id = b.product_session_id
     WHERE b.request_id IS NOT NULL
    UNION ALL
    SELECT r.request_id, r.status, r.party_size, r.starts_at, r.timezone
      FROM reservations r WHERE r.request_id IS NOT NULL
  ) op ON op.request_id = gt.id`

// The guest's own words where there are any. The booking line is composed in
// TypeScript instead, because it has to read in the record's timezone and SQL
// can only concatenate the stored UTC instant.
const SOURCE_PREVIEW_SQL = `SUBSTR(CASE WHEN gt.kind = 'contact' THEN json_extract(gt.payload_json, '$.message') ELSE NULLIF(TRIM(json_extract(gt.payload_json, '$.notes')), '') END, 1, 160)`

const SOURCE_PREVIEW_COLUMNS = `op.starts_at AS record_starts_at, op.timezone AS record_timezone, op.party_size AS record_party_size,
      json_extract(gt.payload_json, '$.party_size_is_minimum') AS party_size_is_minimum`

function sourcePreviewText(row: {
  source_preview: string | null
  record_starts_at: string | null
  record_timezone: string | null
  record_party_size: number | null
  party_size_is_minimum: unknown
}): string | null {
  if (row.source_preview) return row.source_preview
  if (!row.record_starts_at || !row.record_timezone || row.record_party_size === null) return null
  const when = formatThreadWhenLabel(row.record_starts_at, row.record_timezone)
  return `${when} - ${row.record_party_size}${row.party_size_is_minimum ? '+' : ''} guests`.slice(0, 160)
}

export interface OperationSummary {
  openThreads: number
  unreadThreads: number
  reservations: number
  experienceBookings: number
}

export async function getGuestThreadOperationSummary(
  db: DbClient,
  siteId: string | null,
  opts: ListGuestThreadsOptions,
): Promise<OperationSummary> {
  const params: Array<string | number> = []
  let where: string

  if (siteId) {
    params.push(siteId)
    where = 'gt.site_id = ?'
  } else if (opts.organizationId) {
    params.push(opts.organizationId)
    where = 'gt.organization_id = ?'
  } else {
    return { openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 }
  }

  if (opts.locationId) {
    where += ' AND gt.location_id = ?'
    params.push(opts.locationId)
  }
  if (opts.principal && 'siteId' in opts.principal) {
    const accessibleLocationIds = await listAccessibleLocationIds(db, opts.principal)
    if (accessibleLocationIds !== null) {
      if (accessibleLocationIds.length === 0) {
        return { openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 }
      }
      if (opts.locationId) {
        if (!accessibleLocationIds.includes(opts.locationId)) {
          return { openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 }
        }
      } else {
        where += ` AND gt.location_id IN (SELECT value FROM json_each(?))`
        params.push(d1JsonStringSet(accessibleLocationIds))
      }
    }
  } else if (opts.principal && isScopedRole(opts.principal.role)) {
    const teamIds = opts.principal.teamIds ?? []
    if (teamIds.length === 0) return { openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 }
    const teamIdsJson = d1JsonStringSet(teamIds)
    where += ` AND (
      EXISTS (SELECT 1 FROM sites scoped_site WHERE scoped_site.id = gt.site_id AND scoped_site.team_id IN (SELECT value FROM json_each(?)))
      OR EXISTS (SELECT 1 FROM business_locations scoped_location WHERE scoped_location.id = gt.location_id AND scoped_location.team_id IN (SELECT value FROM json_each(?)))
    )`
    params.push(teamIdsJson, teamIdsJson)
  } else if (opts.principal && !isOrganizationWideRole(opts.principal.role)) {
    return { openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 }
  }

  const counts = await queryFirst<OperationSummary>(db, `
    SELECT
      SUM(CASE WHEN gt.conversation_state != 'resolved' THEN 1 ELSE 0 END) AS openThreads,
      0 AS unreadThreads,
      SUM(CASE WHEN gt.conversation_state != 'resolved' AND gt.kind = 'reservation' THEN 1 ELSE 0 END) AS reservations,
      SUM(CASE WHEN gt.conversation_state != 'resolved' AND gt.kind = 'booking' THEN 1 ELSE 0 END) AS experienceBookings
    FROM requests gt${OPERATIONAL_RECORD_SQL}
    WHERE gt.kind IN ('contact', 'reservation', 'booking') AND ${where}
  `, params)

  const unreadThreads = opts.userId
    ? await countUnreadThreadIds(db, where, params, opts.userId)
    : 0

  return {
    openThreads: counts?.openThreads ?? 0,
    unreadThreads,
    reservations: counts?.reservations ?? 0,
    experienceBookings: counts?.experienceBookings ?? 0,
  }
}

async function countUnreadThreadIds(
  db: DbClient,
  where: string,
  params: Array<string | number>,
  userId: string,
): Promise<number> {
  const rows = await queryAll<{ id: string }>(db, `
    SELECT gt.id
    FROM requests gt${OPERATIONAL_RECORD_SQL}
    WHERE gt.kind IN ('contact', 'reservation', 'booking') AND ${where}
      AND EXISTS (
        SELECT 1 FROM activity_entries n
        JOIN activity_entries notification_entry ON notification_entry.id = n.parent_id
        LEFT JOIN activity_entries nr ON nr.parent_id = n.id AND nr.actor_user_id = ? AND nr.kind = 'acknowledgement'
        WHERE notification_entry.request_id = gt.id
          AND (n.target_user_id IS NULL OR n.target_user_id = ?)
          AND nr.id IS NULL AND n.kind = 'notification'
      )
  `, [...params, userId, userId])
  return rows.length
}

type GuestThreadListRow = GuestThreadRow & {
  guest_name: string
  location_title: string | null
  site_name?: string | null
  site_slug?: string | null
  latest_message_body: string | null
  latest_message_kind: 'message' | null
  source_preview: string | null
  record_starts_at: string | null
  record_timezone: string | null
  record_party_size: number | null
  party_size_is_minimum: unknown
  operational_status: string | null
}

/** Returns list view models with member-specific unread and one canonical `preview` field. */
export async function listGuestThreads(
  db: DbClient,
  siteId: string,
  opts: ListGuestThreadsOptions,
): Promise<GuestThreadListItemViewModel[]> {
  const params: Array<string | number> = [siteId]
  let where = 'gt.site_id = ?'

  if (opts.locationId) {
    where += ' AND gt.location_id = ?'
    params.push(opts.locationId)
  }
  if (opts.principal && 'siteId' in opts.principal) {
    const accessibleLocationIds = await listAccessibleLocationIds(db, opts.principal)
    if (accessibleLocationIds !== null) {
      if (accessibleLocationIds.length === 0) return []
      if (opts.locationId) {
        if (!accessibleLocationIds.includes(opts.locationId)) return []
      } else {
        where += ` AND gt.location_id IN (SELECT value FROM json_each(?))`
        params.push(d1JsonStringSet(accessibleLocationIds))
      }
    }
  }
  if (opts.type) {
    where += ' AND gt.kind = ?'
    params.push(opts.type)
  }
  if (opts.conversationState) {
    where += ' AND gt.conversation_state = ?'
    params.push(opts.conversationState)
  }
  if (opts.search?.trim()) {
    const like = `%${opts.search.trim().toLowerCase()}%`
    where += ` AND (LOWER(${SOURCE_GUEST_NAME_SQL}) LIKE ? OR LOWER(COALESCE(${SOURCE_GUEST_EMAIL_SQL}, '')) LIKE ? OR LOWER(COALESCE(${SOURCE_GUEST_PHONE_SQL}, '')) LIKE ?)`
    params.push(like, like, like)
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 100, 200))

  const unreadFilter = opts.unreadOnly && opts.userId
    ? `
      AND EXISTS (
        SELECT 1 FROM activity_entries n
        JOIN activity_entries notification_entry ON notification_entry.id = n.parent_id
        LEFT JOIN activity_entries nr ON nr.parent_id = n.id AND nr.actor_user_id = ? AND nr.kind = 'acknowledgement'
        WHERE notification_entry.request_id = gt.id
          AND (n.target_user_id IS NULL OR n.target_user_id = ?)
          AND nr.id IS NULL AND n.kind = 'notification'
      )
    `
    : ''

  const rows = await queryAll<GuestThreadListRow>(db, `
    SELECT
      gt.*,
      ${SOURCE_GUEST_NAME_SQL} AS guest_name,
      bl.title AS location_title,
      (
        SELECT body FROM activity_entries
        WHERE request_id = gt.id AND kind = 'message'
        ORDER BY sequence DESC LIMIT 1
      ) AS latest_message_body,
      (
        SELECT kind FROM activity_entries
        WHERE request_id = gt.id AND kind = 'message'
        ORDER BY sequence DESC LIMIT 1
      ) AS latest_message_kind,
      ${SOURCE_PREVIEW_SQL} AS source_preview,
      ${SOURCE_PREVIEW_COLUMNS},
      op.status AS operational_status
    FROM requests gt${OPERATIONAL_RECORD_SQL}
    LEFT JOIN business_locations bl ON bl.id = gt.location_id
    WHERE gt.kind IN ('contact', 'reservation', 'booking') AND ${where}
    ${unreadFilter}
    ORDER BY gt.updated_at DESC
    LIMIT ?
  `, opts.unreadOnly && opts.userId ? [...params, opts.userId, opts.userId, limit] : [...params, limit])

  const unreadIds = opts.userId
    ? new Set(await listUnreadThreadIds(db, rows.map(row => row.id), opts.userId))
    : new Set<string>()
  const items: GuestThreadListItemViewModel[] = []
  for (const row of rows ?? []) {
    const unread = unreadIds.has(row.id)
    const preview = sourcePreviewText(row)
    items.push({
      id: row.id,
      guestName: row.guest_name,
      submissionType: row.kind,
      contextLabel: preview ?? '',
      locationLabel: row.location_title,
      conversationState: row.conversation_state,
      conversationStateLabel: CONVERSATION_STATE_LABELS[row.conversation_state],
      operationalStatus: row.operational_status,
      operationalStatusLabel: row.operational_status ? formatOperationalStatusLabel(row.kind, row.operational_status) : null,
      unread,
      unreadCount: unread ? 1 : 0,
      preview: row.latest_message_kind === 'message'
        ? { kind: 'message', text: row.latest_message_body ?? '' }
        : (preview ? { kind: 'submission', text: preview } : null),
      lastActivityAt: row.updated_at,
      needsAttention: row.conversation_state === 'needs_attention',
    })
  }
  return items
}

export async function listOrganizationGuestThreads(
  db: DbClient,
  opts: Omit<ListGuestThreadsOptions, 'principal'> & {
    organizationId: string
    principal: {
      memberId: string
      role: string
      organizationId: string
      teamIds: string[] | null
    }
  },
): Promise<GuestThreadListItemViewModel[]> {
  const params: Array<string | number> = [opts.organizationId]
  let where = 'gt.organization_id = ?'

  if (opts.siteId) {
    where += ' AND gt.site_id = ?'
    params.push(opts.siteId)
  }
  if (opts.locationId) {
    where += ' AND gt.location_id = ?'
    params.push(opts.locationId)
  }
  if (isScopedRole(opts.principal.role)) {
    const teamIds = opts.principal.teamIds ?? []
    if (teamIds.length === 0) return []
    const teamIdsJson = d1JsonStringSet(teamIds)
    where += ` AND (s.team_id IN (SELECT value FROM json_each(?)) OR bl.team_id IN (SELECT value FROM json_each(?)))`
    params.push(teamIdsJson, teamIdsJson)
  } else if (!isOrganizationWideRole(opts.principal.role)) {
    return []
  }
  if (opts.type) {
    where += ' AND gt.kind = ?'
    params.push(opts.type)
  }
  if (opts.conversationState) {
    where += ' AND gt.conversation_state = ?'
    params.push(opts.conversationState)
  }
  if (opts.search?.trim()) {
    const like = `%${opts.search.trim().toLowerCase()}%`
    where += ` AND (LOWER(${SOURCE_GUEST_NAME_SQL}) LIKE ? OR LOWER(COALESCE(${SOURCE_GUEST_EMAIL_SQL}, '')) LIKE ? OR LOWER(COALESCE(${SOURCE_GUEST_PHONE_SQL}, '')) LIKE ?)`
    params.push(like, like, like)
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 100, 200))

  const unreadFilter = opts.unreadOnly && opts.userId
    ? `
      AND EXISTS (
        SELECT 1 FROM activity_entries n
        JOIN activity_entries notification_entry ON notification_entry.id = n.parent_id
        LEFT JOIN activity_entries nr ON nr.parent_id = n.id AND nr.actor_user_id = ? AND nr.kind = 'acknowledgement'
        WHERE notification_entry.request_id = gt.id
          AND (n.target_user_id IS NULL OR n.target_user_id = ?)
          AND nr.id IS NULL AND n.kind = 'notification'
      )
    `
    : ''

  const rows = await queryAll<GuestThreadListRow>(db, `
    SELECT
      gt.*,
      ${SOURCE_GUEST_NAME_SQL} AS guest_name,
      bl.title AS location_title,
      s.brand_name AS site_name,
      s.subdomain AS site_slug,
      (
        SELECT body FROM activity_entries
        WHERE request_id = gt.id AND kind = 'message'
        ORDER BY sequence DESC LIMIT 1
      ) AS latest_message_body,
      (
        SELECT kind FROM activity_entries
        WHERE request_id = gt.id AND kind = 'message'
        ORDER BY sequence DESC LIMIT 1
      ) AS latest_message_kind,
      ${SOURCE_PREVIEW_SQL} AS source_preview,
      ${SOURCE_PREVIEW_COLUMNS},
      op.status AS operational_status
    FROM requests gt${OPERATIONAL_RECORD_SQL}
    LEFT JOIN business_locations bl ON bl.id = gt.location_id
    LEFT JOIN sites s ON s.id = gt.site_id
    WHERE gt.kind IN ('contact', 'reservation', 'booking') AND ${where}
    ${unreadFilter}
    ORDER BY gt.updated_at DESC
    LIMIT ?
  `, opts.unreadOnly && opts.userId ? [...params, opts.userId, opts.userId, limit] : [...params, limit])

  const unreadIds = opts.userId
    ? new Set(await listUnreadThreadIds(db, rows.map(row => row.id), opts.userId))
    : new Set<string>()
  const items: GuestThreadListItemViewModel[] = []
  for (const row of rows ?? []) {
    const unread = unreadIds.has(row.id)
    const siteSlug = row.site_slug?.trim()
    if (!siteSlug) throw new Error(`Guest thread ${row.id} belongs to a site without a subdomain`)
    const contextLabel = row.site_name && row.location_title
      ? `${row.site_name} · ${row.location_title}`
      : row.site_name || row.location_title || ''
    const preview = sourcePreviewText(row)
    items.push({
      id: row.id,
      siteId: row.site_id,
      siteSlug,
      guestName: row.guest_name,
      submissionType: row.kind,
      contextLabel,
      locationLabel: row.location_title,
      conversationState: row.conversation_state,
      conversationStateLabel: CONVERSATION_STATE_LABELS[row.conversation_state],
      operationalStatus: row.operational_status,
      operationalStatusLabel: row.operational_status ? formatOperationalStatusLabel(row.kind, row.operational_status) : null,
      unread,
      unreadCount: unread ? 1 : 0,
      preview: row.latest_message_kind === 'message'
        ? { kind: 'message', text: row.latest_message_body ?? '' }
        : (preview ? { kind: 'submission', text: preview } : null),
      lastActivityAt: row.updated_at,
      needsAttention: row.conversation_state === 'needs_attention',
    })
  }
  return items
}

async function listUnreadThreadIds(db: DbClient, threadIds: string[], userId: string): Promise<string[]> {
  if (threadIds.length === 0) return []
  const rows = await queryAll<{ request_id: string }>(db, `
    SELECT gt.id AS request_id
    FROM requests gt${OPERATIONAL_RECORD_SQL}
    WHERE gt.id IN (SELECT value FROM json_each(?))
      AND EXISTS (
        SELECT 1 FROM activity_entries n
        JOIN activity_entries notification_entry ON notification_entry.id = n.parent_id
        LEFT JOIN activity_entries nr ON nr.parent_id = n.id AND nr.actor_user_id = ? AND nr.kind = 'acknowledgement'
        WHERE notification_entry.request_id = gt.id
          AND (n.target_user_id IS NULL OR n.target_user_id = ?)
          AND nr.id IS NULL AND n.kind = 'notification'
      )
  `, [d1JsonStringSet(threadIds), userId, userId])
  return (rows ?? []).map(row => row.request_id)
}

export async function updateThreadProjection(
  db: DbClient,
  threadId: string,
  update: { conversationState: ConversationState },
): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE requests
    SET conversation_state = ?, resolved_at = ?, updated_at = ?
    WHERE id = ?
  `, [update.conversationState, update.conversationState === 'resolved' ? now : null, now, threadId])
}

export async function updateThreadProjectionIfLatestEntry(
  db: DbClient,
  threadId: string,
  entryId: string,
  update: { conversationState: ConversationState },
): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE requests
    SET conversation_state = ?, resolved_at = ?, updated_at = ?
    WHERE id = ?
      AND EXISTS (
        SELECT 1
        FROM activity_entries projected
        WHERE projected.id = ?
          AND projected.request_id = requests.id
          AND NOT EXISTS (
            SELECT 1
            FROM activity_entries later
            WHERE later.request_id = projected.request_id
              AND later.sequence > projected.sequence
          )
      )
  `, [update.conversationState, update.conversationState === 'resolved' ? now : null, now, threadId, entryId])
}
