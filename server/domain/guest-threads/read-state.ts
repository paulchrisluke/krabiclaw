import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { listAccessibleLocationIds, type MemberAccessPrincipal } from '~/server/utils/member-access'
import type { GuestThreadMemberStateRow } from './types'

export async function getMemberCursor(
  db: DbClient,
  threadId: string,
  memberId: string,
): Promise<GuestThreadMemberStateRow | null> {
  return await queryFirst<GuestThreadMemberStateRow>(db, `
    SELECT * FROM guest_thread_member_state
    WHERE thread_id = ? AND member_id = ?
    LIMIT 1
  `, [threadId, memberId])
}

/**
 * Advances only the given member's read cursor. Never touches other members' cursors —
 * one manager opening a thread must not mark it read for anyone else (issue #442 Locked
 * Decision #10).
 */
export async function advanceMemberCursor(
  db: DbClient,
  threadId: string,
  memberId: string,
  entryId: string | null,
): Promise<boolean> {
  const now = new Date().toISOString()
  const entry = entryId
    ? await queryFirst<{ sequence: number }>(db, `SELECT sequence FROM guest_thread_entries WHERE id = ? AND thread_id = ? LIMIT 1`, [entryId, threadId])
    : await queryFirst<{ sequence: number }>(db, `SELECT COALESCE(MAX(sequence), 0) AS sequence FROM guest_thread_entries WHERE thread_id = ?`, [threadId])
  const sequence = entry?.sequence ?? 0
  const current = await getMemberCursor(db, threadId, memberId)
  if (current && current.last_read_sequence >= sequence) return false
  await execute(db, `
    INSERT INTO guest_thread_member_state (thread_id, member_id, last_read_entry_id, last_read_sequence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (thread_id, member_id) DO UPDATE SET
      last_read_entry_id = CASE
        WHEN excluded.last_read_sequence >= guest_thread_member_state.last_read_sequence THEN excluded.last_read_entry_id
        ELSE guest_thread_member_state.last_read_entry_id
      END,
      last_read_sequence = MAX(guest_thread_member_state.last_read_sequence, excluded.last_read_sequence),
      updated_at = CASE
        WHEN excluded.last_read_sequence >= guest_thread_member_state.last_read_sequence THEN excluded.updated_at
        ELSE guest_thread_member_state.updated_at
      END
  `, [threadId, memberId, entryId, sequence, now, now])
  return true
}

/**
 * True when the thread has any entry occurring after the member's last-read cursor
 * (or the member has never read it at all).
 */
export async function computeUnreadForMember(
  db: DbClient,
  threadId: string,
  memberId: string,
): Promise<boolean> {
  const cursor = await getMemberCursor(db, threadId, memberId)
  if (!cursor || cursor.last_read_sequence <= 0) {
    const anyEntry = await queryFirst<{ id: string }>(db, `
      SELECT id FROM guest_thread_entries WHERE thread_id = ? LIMIT 1
    `, [threadId])
    return Boolean(anyEntry)
  }

  const newer = await queryFirst<{ id: string }>(db, `
    SELECT id FROM guest_thread_entries
    WHERE thread_id = ? AND sequence > ?
    LIMIT 1
  `, [threadId, cursor.last_read_sequence])
  return Boolean(newer)
}

/**
 * Site/location-scoped unread aggregation for a given member, honoring the same
 * Teams-based scope rules as listGuestThreads (site-wide roles see everything;
 * location-scoped editors only see their assigned locations).
 */
export async function countUnreadForMemberInScope(
  db: DbClient,
  siteId: string,
  principal: MemberAccessPrincipal,
  opts: { locationId?: string | null } = {},
): Promise<number> {
  const params: Array<string | number> = [principal.memberId, siteId]
  let where = 'gt.site_id = ?'

  if (opts.locationId) {
    where += ' AND gt.location_id = ?'
    params.push(opts.locationId)
  } else {
    const accessibleLocationIds = await listAccessibleLocationIds(db, principal)
    if (accessibleLocationIds !== null) {
      if (accessibleLocationIds.length === 0) return 0
      where += ` AND gt.location_id IN (${accessibleLocationIds.map(() => '?').join(', ')})`
      params.push(...accessibleLocationIds)
    }
  }

  const rows = await queryAll<{ id: string }>(db, `
    SELECT gt.id
    FROM guest_threads gt
    LEFT JOIN guest_thread_member_state gms ON gms.thread_id = gt.id AND gms.member_id = ?
    WHERE ${where}
      AND EXISTS (
        SELECT 1 FROM guest_thread_entries e
        WHERE e.thread_id = gt.id
          AND e.sequence > COALESCE(gms.last_read_sequence, 0)
      )
  `, params)

  return rows.length
}
