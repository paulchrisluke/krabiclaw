import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import {
  isOrganizationWideRole,
  isScopedRole,
  listAccessibleLocationIds,
} from '~/server/utils/member-access'
import { CONVERSATION_STATE_LABELS } from './types'
import type {
  AnyGuestThreadSourceAdapter,
  ConversationState,
  GuestThreadListItemViewModel,
  GuestThreadRow,
  GuestThreadSubmissionType,
  ListGuestThreadsOptions,
} from './types'
import { formatOperationalStatusLabel } from './status-labels'
import { publishGuestInboxThreadEvent, type GuestInboxPublicationEnv } from '~/server/cloudflare/guest-inbox-events'

export async function getGuestThreadBySubmission(
  db: DbClient,
  submissionType: GuestThreadSubmissionType,
  submissionId: string,
): Promise<GuestThreadRow | null> {
  return await queryFirst<GuestThreadRow>(db, `
    SELECT * FROM guest_threads
    WHERE submission_type = ? AND submission_id = ?
    LIMIT 1
  `, [submissionType, submissionId])
}

export async function getGuestThreadById(
  db: DbClient,
  threadId: string,
  siteId?: string,
): Promise<GuestThreadRow | null> {
  return await queryFirst<GuestThreadRow>(db, `
    SELECT * FROM guest_threads
    WHERE id = ?
    ${siteId ? 'AND site_id = ?' : ''}
    LIMIT 1
  `, siteId ? [threadId, siteId] : [threadId])
}

/**
 * Idempotently creates the thread aggregate for a submission, atomically persisting the
 * immutable opening `submission` ledger entry alongside it in a single D1 batch (issue
 * #442 Locked Decision #3 — the opening submission must never exist without its entry,
 * or vice versa). Safe to call repeatedly; returns the existing thread on subsequent
 * calls without re-appending the opening entry.
 */
export async function ensureGuestThread(
  db: DbClient,
  adapter: AnyGuestThreadSourceAdapter,
  submissionId: string,
  options: { publishEnv?: GuestInboxPublicationEnv } = {},
): Promise<GuestThreadRow> {
  const existing = await getGuestThreadBySubmission(db, adapter.type, submissionId)
  const source = await adapter.loadSource({ db }, submissionId)
  if (!source) throw new Error('Submission not found')

  const summary = adapter.summarize(source)

  if (existing) {
    if ((existing.location_id ?? null) !== (summary.locationId ?? null)) {
      const now = new Date().toISOString()
      await execute(db, `
        UPDATE guest_threads SET location_id = ?, updated_at = ? WHERE id = ?
      `, [summary.locationId, now, existing.id])
      if (options.publishEnv) {
        await publishGuestInboxThreadEvent(options.publishEnv, db, { threadId: existing.id, type: 'thread.changed' })
      }
      return { ...existing, location_id: summary.locationId, updated_at: now }
    }
    return existing
  }

  const threadId = crypto.randomUUID()
  const entryId = crypto.randomUUID()
  const now = new Date().toISOString()
  const openingSnapshot = adapter.createOpeningSnapshot(source)

  try {
    await executeBatch(db, [
      {
        query: `
          INSERT INTO guest_threads
            (id, organization_id, site_id, location_id, submission_type, submission_id, guest_name, guest_email, guest_phone,
             conversation_state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_attention', ?, ?)
        `,
        params: [
          threadId,
          summary.organizationId,
          summary.siteId,
          summary.locationId,
          adapter.type,
          submissionId,
          summary.guestName,
          summary.guestEmail,
          summary.guestPhone,
          summary.createdAt,
          now,
        ],
      },
      {
        query: `
          INSERT INTO guest_thread_entries
            (id, thread_id, organization_id, site_id, kind, actor_kind, channel, body, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
          VALUES (?, ?, ?, ?, 'submission', 'guest', 'system', ?, ?, ?, ?, 1, ?, ?)
        `,
        params: [
          entryId,
          threadId,
          summary.organizationId,
          summary.siteId,
          summary.contextLabel,
          `${adapter.type}_submitted`,
          JSON.stringify(openingSnapshot),
          `submission:${adapter.type}:${submissionId}`,
          summary.createdAt,
          now,
        ],
      },
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) {
      const concurrent = await getGuestThreadBySubmission(db, adapter.type, submissionId)
      if (concurrent) return concurrent
    }
    throw error instanceof Error ? error : new Error(message)
  }

  const created = await getGuestThreadById(db, threadId)
  if (!created) throw new Error('Failed to load guest thread')
  if (options.publishEnv) {
    await publishGuestInboxThreadEvent(options.publishEnv, db, { threadId: created.id, type: 'thread.created' })
  }
  return created
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
      SUM(CASE WHEN gt.conversation_state != 'resolved' AND gt.submission_type = 'reservation' THEN 1 ELSE 0 END) AS reservations,
      SUM(CASE WHEN gt.conversation_state != 'resolved' AND gt.submission_type = 'experience_booking' THEN 1 ELSE 0 END) AS experienceBookings
    FROM guest_threads gt
    WHERE ${where}
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
    FROM guest_threads gt
    WHERE ${where}
      AND EXISTS (
        SELECT 1 FROM notifications n
        LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
        WHERE n.guest_thread_id = gt.id
          AND (n.target_user_id IS NULL OR n.target_user_id = ?)
          AND nr.notification_id IS NULL
      )
  `, [...params, userId, userId])
  return rows.length
}

interface GuestThreadListRow extends GuestThreadRow {
  location_title: string | null
  site_name?: string | null
  site_slug?: string | null
  latest_message_body: string | null
  latest_message_kind: 'message' | null
  opening_body: string | null
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
    where += ' AND gt.submission_type = ?'
    params.push(opts.type)
  }
  if (opts.conversationState) {
    where += ' AND gt.conversation_state = ?'
    params.push(opts.conversationState)
  }
  if (opts.search?.trim()) {
    const like = `%${opts.search.trim().toLowerCase()}%`
    where += ' AND (LOWER(gt.guest_name) LIKE ? OR LOWER(COALESCE(gt.guest_email, \'\')) LIKE ? OR LOWER(COALESCE(gt.guest_phone, \'\')) LIKE ?)'
    params.push(like, like, like)
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 100, 200))

  const unreadFilter = opts.unreadOnly && opts.userId
    ? `
      AND EXISTS (
        SELECT 1 FROM notifications n
        LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
        WHERE n.guest_thread_id = gt.id
          AND (n.target_user_id IS NULL OR n.target_user_id = ?)
          AND nr.notification_id IS NULL
      )
    `
    : ''

  const rows = await queryAll<GuestThreadListRow>(db, `
    SELECT
      gt.*,
      bl.title AS location_title,
      (
        SELECT body FROM guest_thread_entries
        WHERE thread_id = gt.id AND kind = 'message'
        ORDER BY sequence DESC LIMIT 1
      ) AS latest_message_body,
      (
        SELECT kind FROM guest_thread_entries
        WHERE thread_id = gt.id AND kind = 'message'
        ORDER BY sequence DESC LIMIT 1
      ) AS latest_message_kind,
      (
        SELECT body FROM guest_thread_entries
        WHERE thread_id = gt.id AND kind = 'submission'
        ORDER BY sequence ASC LIMIT 1
      ) AS opening_body,
      CASE gt.submission_type
        WHEN 'reservation' THEN rs.status
        WHEN 'experience_booking' THEN eb.status
        WHEN 'contact' THEN cs.status
      END AS operational_status
    FROM guest_threads gt
    LEFT JOIN business_locations bl ON bl.id = gt.location_id
    LEFT JOIN reservation_submissions rs ON gt.submission_type = 'reservation' AND rs.id = gt.submission_id
    LEFT JOIN experience_bookings eb ON gt.submission_type = 'experience_booking' AND eb.id = gt.submission_id
    LEFT JOIN contact_submissions cs ON gt.submission_type = 'contact' AND cs.id = gt.submission_id
    WHERE ${where}
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
    items.push({
      id: row.id,
      guestName: row.guest_name,
      submissionType: row.submission_type,
      contextLabel: row.opening_body ?? '',
      locationLabel: row.location_title,
      conversationState: row.conversation_state,
      conversationStateLabel: CONVERSATION_STATE_LABELS[row.conversation_state],
      operationalStatus: row.operational_status,
      operationalStatusLabel: row.operational_status ? formatOperationalStatusLabel(row.submission_type, row.operational_status) : null,
      unread,
      unreadCount: unread ? 1 : 0,
      preview: row.latest_message_kind === 'message'
        ? { kind: 'message', text: row.latest_message_body ?? '' }
        : (row.opening_body ? { kind: 'submission', text: row.opening_body } : null),
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
    where += ' AND gt.submission_type = ?'
    params.push(opts.type)
  }
  if (opts.conversationState) {
    where += ' AND gt.conversation_state = ?'
    params.push(opts.conversationState)
  }
  if (opts.search?.trim()) {
    const like = `%${opts.search.trim().toLowerCase()}%`
    where += ' AND (LOWER(gt.guest_name) LIKE ? OR LOWER(COALESCE(gt.guest_email, \'\')) LIKE ? OR LOWER(COALESCE(gt.guest_phone, \'\')) LIKE ?)'
    params.push(like, like, like)
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 100, 200))

  const unreadFilter = opts.unreadOnly && opts.userId
    ? `
      AND EXISTS (
        SELECT 1 FROM notifications n
        LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
        WHERE n.guest_thread_id = gt.id
          AND (n.target_user_id IS NULL OR n.target_user_id = ?)
          AND nr.notification_id IS NULL
      )
    `
    : ''

  const rows = await queryAll<GuestThreadListRow>(db, `
    SELECT
      gt.*,
      bl.title AS location_title,
      s.brand_name AS site_name,
      s.subdomain AS site_slug,
      (
        SELECT body FROM guest_thread_entries
        WHERE thread_id = gt.id AND kind = 'message'
        ORDER BY sequence DESC LIMIT 1
      ) AS latest_message_body,
      (
        SELECT kind FROM guest_thread_entries
        WHERE thread_id = gt.id AND kind = 'message'
        ORDER BY sequence DESC LIMIT 1
      ) AS latest_message_kind,
      (
        SELECT body FROM guest_thread_entries
        WHERE thread_id = gt.id AND kind = 'submission'
        ORDER BY sequence ASC LIMIT 1
      ) AS opening_body,
      CASE gt.submission_type
        WHEN 'reservation' THEN rs.status
        WHEN 'experience_booking' THEN eb.status
        WHEN 'contact' THEN cs.status
      END AS operational_status
    FROM guest_threads gt
    LEFT JOIN business_locations bl ON bl.id = gt.location_id
    LEFT JOIN sites s ON s.id = gt.site_id
    LEFT JOIN reservation_submissions rs ON gt.submission_type = 'reservation' AND rs.id = gt.submission_id
    LEFT JOIN experience_bookings eb ON gt.submission_type = 'experience_booking' AND eb.id = gt.submission_id
    LEFT JOIN contact_submissions cs ON gt.submission_type = 'contact' AND cs.id = gt.submission_id
    WHERE ${where}
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
    items.push({
      id: row.id,
      siteId: row.site_id,
      siteSlug,
      guestName: row.guest_name,
      submissionType: row.submission_type,
      contextLabel,
      locationLabel: row.location_title,
      conversationState: row.conversation_state,
      conversationStateLabel: CONVERSATION_STATE_LABELS[row.conversation_state],
      operationalStatus: row.operational_status,
      operationalStatusLabel: row.operational_status ? formatOperationalStatusLabel(row.submission_type, row.operational_status) : null,
      unread,
      unreadCount: unread ? 1 : 0,
      preview: row.latest_message_kind === 'message'
        ? { kind: 'message', text: row.latest_message_body ?? '' }
        : (row.opening_body ? { kind: 'submission', text: row.opening_body } : null),
      lastActivityAt: row.updated_at,
      needsAttention: row.conversation_state === 'needs_attention',
    })
  }
  return items
}

async function listUnreadThreadIds(db: DbClient, threadIds: string[], userId: string): Promise<string[]> {
  if (threadIds.length === 0) return []
  const rows = await queryAll<{ thread_id: string }>(db, `
    SELECT gt.id AS thread_id
    FROM guest_threads gt
    WHERE gt.id IN (SELECT value FROM json_each(?))
      AND EXISTS (
        SELECT 1 FROM notifications n
        LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
        WHERE n.guest_thread_id = gt.id
          AND (n.target_user_id IS NULL OR n.target_user_id = ?)
          AND nr.notification_id IS NULL
      )
  `, [d1JsonStringSet(threadIds), userId, userId])
  return (rows ?? []).map(row => row.thread_id)
}

export async function updateThreadProjection(
  db: DbClient,
  threadId: string,
  update: { conversationState: ConversationState },
): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE guest_threads
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
    UPDATE guest_threads
    SET conversation_state = ?, resolved_at = ?, updated_at = ?
    WHERE id = ?
      AND EXISTS (
        SELECT 1
        FROM guest_thread_entries projected
        WHERE projected.id = ?
          AND projected.thread_id = guest_threads.id
          AND NOT EXISTS (
            SELECT 1
            FROM guest_thread_entries later
            WHERE later.thread_id = projected.thread_id
              AND later.sequence > projected.sequence
          )
      )
  `, [update.conversationState, update.conversationState === 'resolved' ? now : null, now, threadId, entryId])
}
