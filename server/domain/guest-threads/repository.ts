import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { listAccessibleLocationIds } from '~/server/utils/member-access'
import { CONVERSATION_STATE_LABELS } from './types'
import type {
  AnyGuestThreadSourceAdapter,
  ConversationState,
  GuestThreadListItemViewModel,
  GuestThreadRow,
  GuestThreadSubmissionType,
  ListGuestThreadsOptions,
} from './types'
import { computeUnreadForMember } from './read-state'

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
             last_message_at, last_message_preview, conversation_state, operational_status,
             created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_attention', ?, ?, ?)
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
          summary.contextLabel,
          summary.operationalStatus,
          summary.createdAt,
          now,
        ],
      },
      {
        query: `
          INSERT INTO guest_thread_entries
            (id, thread_id, organization_id, site_id, kind, actor_kind, channel, body, event_name, payload_json, occurred_at, created_at)
          VALUES (?, ?, ?, ?, 'submission', 'guest', 'system', NULL, ?, ?, ?, ?)
        `,
        params: [
          entryId,
          threadId,
          summary.organizationId,
          summary.siteId,
          `${adapter.type}_submitted`,
          JSON.stringify(openingSnapshot),
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
  siteId: string,
  opts: ListGuestThreadsOptions,
): Promise<OperationSummary> {
  const params: Array<string | number> = [siteId]
  let where = 'gt.site_id = ?'
  if (opts.locationId) {
    where += ' AND gt.location_id = ?'
    params.push(opts.locationId)
  } else if (opts.principal) {
    const accessibleLocationIds = await listAccessibleLocationIds(db, opts.principal)
    if (accessibleLocationIds !== null) {
      if (accessibleLocationIds.length === 0) {
        return { openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 }
      }
      where += ` AND gt.location_id IN (${accessibleLocationIds.map(() => '?').join(', ')})`
      params.push(...accessibleLocationIds)
    }
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

  const unreadThreads = opts.memberId
    ? await countUnreadThreadIds(db, where, params, opts.memberId)
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
  memberId: string,
): Promise<number> {
  const rows = await queryAll<{ id: string }>(db, `
    SELECT gt.id
    FROM guest_threads gt
    LEFT JOIN guest_thread_member_state gms ON gms.thread_id = gt.id AND gms.member_id = ?
    WHERE ${where}
      AND EXISTS (
        SELECT 1 FROM guest_thread_entries e
        WHERE e.thread_id = gt.id
          AND (gms.last_read_at IS NULL OR e.occurred_at > gms.last_read_at)
      )
  `, [memberId, ...params])
  return rows.length
}

interface GuestThreadListRow extends GuestThreadRow {
  location_title: string | null
  latest_message_body: string | null
  latest_message_kind: 'message' | null
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
  } else if (opts.principal) {
    const accessibleLocationIds = await listAccessibleLocationIds(db, opts.principal)
    if (accessibleLocationIds !== null) {
      if (accessibleLocationIds.length === 0) return []
      where += ` AND gt.location_id IN (${accessibleLocationIds.map(() => '?').join(', ')})`
      params.push(...accessibleLocationIds)
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

  const rows = await queryAll<GuestThreadListRow>(db, `
    SELECT
      gt.*,
      bl.title AS location_title,
      (
        SELECT body FROM guest_thread_entries
        WHERE thread_id = gt.id AND kind = 'message'
        ORDER BY occurred_at DESC LIMIT 1
      ) AS latest_message_body,
      (
        SELECT kind FROM guest_thread_entries
        WHERE thread_id = gt.id AND kind = 'message'
        ORDER BY occurred_at DESC LIMIT 1
      ) AS latest_message_kind
    FROM guest_threads gt
    LEFT JOIN business_locations bl ON bl.id = gt.location_id
    WHERE ${where}
    ORDER BY gt.updated_at DESC
    LIMIT ?
  `, [...params, limit])

  const items: GuestThreadListItemViewModel[] = []
  for (const row of rows ?? []) {
    const unread = opts.memberId ? await computeUnreadForMember(db, row.id, opts.memberId) : false
    if (opts.unreadOnly && !unread) continue
    items.push({
      id: row.id,
      guestName: row.guest_name,
      submissionType: row.submission_type,
      contextLabel: row.last_message_preview ?? '',
      locationLabel: row.location_title,
      conversationState: row.conversation_state,
      conversationStateLabel: CONVERSATION_STATE_LABELS[row.conversation_state],
      operationalStatus: row.operational_status,
      operationalStatusLabel: row.operational_status,
      unread,
      unreadCount: unread ? 1 : 0,
      preview: row.latest_message_kind === 'message'
        ? { kind: 'message', text: row.latest_message_body ?? '' }
        : (row.last_message_preview ? { kind: 'submission', text: row.last_message_preview } : null),
      lastActivityAt: row.updated_at,
      needsAttention: row.conversation_state === 'needs_attention',
    })
  }
  return items
}

/** Refreshes the read-optimized operational_status/conversation_state/resolved_at projection. */
export async function updateThreadProjection(
  db: DbClient,
  threadId: string,
  update: { operationalStatus?: string; conversationState?: ConversationState },
): Promise<void> {
  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const params: Array<string | null> = [now]

  if (update.operationalStatus !== undefined) {
    sets.push('operational_status = ?')
    params.push(update.operationalStatus)
  }
  if (update.conversationState !== undefined) {
    sets.push('conversation_state = ?')
    params.push(update.conversationState)
    sets.push('resolved_at = ?')
    params.push(update.conversationState === 'resolved' ? now : null)
  }

  params.push(threadId)
  await execute(db, `UPDATE guest_threads SET ${sets.join(', ')} WHERE id = ?`, params)
}
