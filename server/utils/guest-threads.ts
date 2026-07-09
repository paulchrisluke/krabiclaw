import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'

export type GuestThreadSubmissionType = 'contact' | 'reservation' | 'experience_booking'
export type GuestThreadInboxStatus = 'open' | 'waiting_on_owner' | 'waiting_on_guest' | 'closed'

export interface GuestThreadRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  submission_type: GuestThreadSubmissionType
  submission_id: string
  guest_name: string
  guest_email: string | null
  guest_phone: string | null
  inbox_status: GuestThreadInboxStatus
  unread_count: number
  last_message_at: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_message_preview: string | null
  owner_last_seen_at: string | null
  created_at: string
  updated_at: string
}

interface GuestThreadSourceBase {
  organization_id: string
  site_id: string
  location_id: string | null
  guest_name: string
  guest_email: string | null
  guest_phone: string | null
  created_at: string
  operational_status: string
}

interface ContactThreadSource extends GuestThreadSourceBase {
  submission_type: 'contact'
  subject: string | null
  message: string
  experience_title: string | null
}

interface ReservationThreadSource extends GuestThreadSourceBase {
  submission_type: 'reservation'
  date: string
  time: string
  guests: string
  requests: string | null
  location_title: string | null
}

interface ExperienceThreadSource extends GuestThreadSourceBase {
  submission_type: 'experience_booking'
  booking_date: string
  time_slot: string
  party_size: number
  notes: string | null
  location_title: string | null
  experience_title: string | null
}

export type GuestThreadSource = ContactThreadSource | ReservationThreadSource | ExperienceThreadSource

export interface GuestThreadMessageRow {
  id: string
  thread_id: string | null
  submission_type: GuestThreadSubmissionType
  submission_id: string
  organization_id: string
  site_id: string
  direction: 'in' | 'out'
  channel: 'email' | 'whatsapp'
  body: string
  sender_user_id: string | null
  meta_message_id: string | null
  status: string
  error: string | null
  created_at: string
}

export interface GuestThreadSummary extends GuestThreadRow {
  location_title: string | null
  experience_title: string | null
  subject: string | null
  operational_status: string
}

function normalizePreview(text: string | null | undefined, maxLength = 160): string | null {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!value) return null
  return value.slice(0, maxLength)
}

function inferInboxStatusFromMessage(direction: 'in' | 'out'): GuestThreadInboxStatus {
  return direction === 'in' ? 'waiting_on_owner' : 'waiting_on_guest'
}

function buildOpeningPreview(source: GuestThreadSource): string | null {
  if (source.submission_type === 'contact') {
    return normalizePreview(source.experience_title ? `Re: ${source.experience_title} · ${source.message}` : source.message)
  }
  if (source.submission_type === 'reservation') {
    return normalizePreview(`${source.date} ${source.time} · ${source.guests} guests${source.requests ? ` · ${source.requests}` : ''}`)
  }
  return normalizePreview(`${source.experience_title ?? 'Experience'} · ${source.booking_date} ${source.time_slot} · ${source.party_size} guests${source.notes ? ` · ${source.notes}` : ''}`)
}

export async function getGuestThreadSource(
  db: DbClient,
  submissionType: GuestThreadSubmissionType,
  submissionId: string,
): Promise<GuestThreadSource | null> {
  if (submissionType === 'contact') {
    return await queryFirst<ContactThreadSource>(db, `
      SELECT
        ct.organization_id,
        ct.site_id,
        NULL AS location_id,
        ct.name AS guest_name,
        ct.email AS guest_email,
        NULL AS guest_phone,
        ct.created_at,
        ct.status AS operational_status,
        ct.subject,
        ct.message,
        e.title AS experience_title,
        'contact' AS submission_type
      FROM contact_submissions ct
      LEFT JOIN experiences e ON e.id = ct.experience_id
      WHERE ct.id = ?
      LIMIT 1
    `, [submissionId])
  }

  if (submissionType === 'reservation') {
    return await queryFirst<ReservationThreadSource>(db, `
      SELECT
        rs.organization_id,
        rs.site_id,
        rs.location_id,
        rs.name AS guest_name,
        rs.email AS guest_email,
        rs.phone AS guest_phone,
        rs.created_at,
        rs.status AS operational_status,
        rs.date,
        rs.time,
        rs.guests,
        rs.requests,
        bl.title AS location_title,
        'reservation' AS submission_type
      FROM reservation_submissions rs
      LEFT JOIN business_locations bl ON bl.id = rs.location_id
      WHERE rs.id = ?
      LIMIT 1
    `, [submissionId])
  }

  return await queryFirst<ExperienceThreadSource>(db, `
    SELECT
      eb.organization_id,
      eb.site_id,
      eb.location_id,
      eb.guest_name,
      eb.guest_email,
      eb.guest_phone,
      eb.created_at,
      eb.status AS operational_status,
      eb.booking_date,
      eb.time_slot,
      eb.party_size,
      eb.notes,
      bl.title AS location_title,
      e.title AS experience_title,
      'experience_booking' AS submission_type
    FROM experience_bookings eb
    LEFT JOIN business_locations bl ON bl.id = eb.location_id
    LEFT JOIN experiences e ON e.id = eb.experience_id
    WHERE eb.id = ?
    LIMIT 1
  `, [submissionId])
}

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

export async function ensureGuestThread(
  db: DbClient,
  submissionType: GuestThreadSubmissionType,
  submissionId: string,
): Promise<GuestThreadRow> {
  const existing = await getGuestThreadBySubmission(db, submissionType, submissionId)
  if (existing) return existing

  const source = await getGuestThreadSource(db, submissionType, submissionId)
  if (!source) throw new Error('Submission not found')

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const preview = buildOpeningPreview(source)

  try {
    await execute(db, `
      INSERT INTO guest_threads
      (id, organization_id, site_id, location_id, submission_type, submission_id, guest_name, guest_email, guest_phone, inbox_status, unread_count, last_message_at, last_message_preview, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, ?, ?, ?, ?)
    `, [
      id,
      source.organization_id,
      source.site_id,
      source.location_id,
      submissionType,
      submissionId,
      source.guest_name,
      source.guest_email,
      source.guest_phone,
      source.created_at,
      preview,
      now,
      now,
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Only the expected concurrent-insert race (unique submission_type+submission_id)
    // should fall back to the now-existing row — anything else (FK violation, connectivity)
    // should surface as a real failure instead of being silently swallowed.
    if (/UNIQUE constraint failed/i.test(message)) {
      const concurrent = await getGuestThreadBySubmission(db, submissionType, submissionId)
      if (concurrent) return concurrent
    }
    throw error instanceof Error ? error : new Error(message)
  }

  const created = await getGuestThreadById(db, id)
  if (!created) throw new Error('Failed to load guest thread')
  return created
}

export async function attachThreadToSubmissionMessages(
  db: DbClient,
  threadId: string,
  submissionType: GuestThreadSubmissionType,
  submissionId: string,
): Promise<void> {
  await execute(db, `
    UPDATE submission_messages
    SET thread_id = ?
    WHERE submission_type = ? AND submission_id = ? AND (thread_id IS NULL OR thread_id = '')
  `, [threadId, submissionType, submissionId])
}

export async function syncGuestThreadAfterMessage(
  db: DbClient,
  opts: {
    threadId: string
    direction: 'in' | 'out'
    body: string
    createdAt?: string
    incrementUnread?: boolean
  },
): Promise<void> {
  const at = opts.createdAt ?? new Date().toISOString()
  const preview = normalizePreview(opts.body)
  // An owner reply implies the owner has seen the thread, so clear unread_count too.
  const fields = opts.direction === 'in'
    ? ['last_inbound_at = ?', 'unread_count = unread_count + ?']
    : ['last_outbound_at = ?', 'unread_count = 0']
  const params: Array<string | number | null> = [at]
  if (opts.direction === 'in') params.push(opts.incrementUnread === false ? 0 : 1)

  // Guard against out-of-order writes (e.g. a delayed webhook retry) clobbering summary
  // fields with stale data — only apply this update if it's not older than what's stored.
  await execute(db, `
    UPDATE guest_threads
    SET
      ${fields.join(', ')},
      inbox_status = ?,
      last_message_at = ?,
      last_message_preview = ?,
      updated_at = ?
    WHERE id = ?
      AND (last_message_at IS NULL OR last_message_at <= ?)
  `, [
    ...params,
    inferInboxStatusFromMessage(opts.direction),
    at,
    preview,
    at,
    opts.threadId,
    at,
  ])
}

export async function listGuestThreads(
  db: DbClient,
  siteId: string,
  opts: {
    locationId?: string | null
    search?: string | null
    type?: GuestThreadSubmissionType | null
    inboxStatus?: GuestThreadInboxStatus | null
    unreadOnly?: boolean
    limit?: number
  } = {},
): Promise<GuestThreadSummary[]> {
  const params: Array<string | number> = [siteId]
  let where = 'gt.site_id = ?'
  if (opts.locationId) {
    where += ' AND (gt.location_id = ? OR gt.location_id IS NULL)'
    params.push(opts.locationId)
  }
  if (opts.type) {
    where += ' AND gt.submission_type = ?'
    params.push(opts.type)
  }
  if (opts.inboxStatus) {
    where += ' AND gt.inbox_status = ?'
    params.push(opts.inboxStatus)
  }
  if (opts.unreadOnly) {
    where += ' AND gt.unread_count > 0'
  }
  if (opts.search?.trim()) {
    const like = `%${opts.search.trim().toLowerCase()}%`
    where += ' AND (LOWER(gt.guest_name) LIKE ? OR LOWER(COALESCE(gt.guest_email, \'\')) LIKE ? OR LOWER(COALESCE(gt.guest_phone, \'\')) LIKE ? OR LOWER(COALESCE(ct.subject, \'\')) LIKE ? OR LOWER(COALESCE(e.title, ce.title, \'\')) LIKE ?)'
    params.push(like, like, like, like, like)
  }
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 200))

  const rows = await queryAll<GuestThreadSummary>(db, `
    SELECT
      gt.*,
      bl.title AS location_title,
      ct.subject AS subject,
      COALESCE(e.title, ce.title) AS experience_title,
      COALESCE(ct.status, rs.status, eb.status) AS operational_status
    FROM guest_threads gt
    LEFT JOIN business_locations bl ON bl.id = gt.location_id
    LEFT JOIN contact_submissions ct ON gt.submission_type = 'contact' AND ct.id = gt.submission_id
    LEFT JOIN reservation_submissions rs ON gt.submission_type = 'reservation' AND rs.id = gt.submission_id
    LEFT JOIN experience_bookings eb ON gt.submission_type = 'experience_booking' AND eb.id = gt.submission_id
    LEFT JOIN experiences e ON gt.submission_type = 'experience_booking' AND e.id = eb.experience_id
    LEFT JOIN experiences ce ON gt.submission_type = 'contact' AND ce.id = ct.experience_id
    WHERE ${where}
    ORDER BY COALESCE(gt.last_message_at, gt.created_at) DESC
    LIMIT ?
  `, [...params, limit])

  return rows ?? []
}

export async function listGuestThreadMessages(
  db: DbClient,
  threadId: string,
): Promise<GuestThreadMessageRow[]> {
  const rows = await queryAll<GuestThreadMessageRow>(db, `
    SELECT id, thread_id, submission_type, submission_id, organization_id, site_id, direction, channel, body, sender_user_id, meta_message_id, status, error, created_at
    FROM submission_messages
    WHERE thread_id = ?
    ORDER BY created_at ASC
  `, [threadId])
  return rows ?? []
}

export async function getGuestThreadDetail(
  db: DbClient,
  threadId: string,
  siteId: string,
): Promise<{ thread: GuestThreadRow; source: GuestThreadSource; messages: GuestThreadMessageRow[] } | null> {
  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return null
  const source = await getGuestThreadSource(db, thread.submission_type, thread.submission_id)
  if (!source) return null
  const messages = await listGuestThreadMessages(db, thread.id)
  return { thread, source, messages }
}

export async function markGuestThreadSeen(
  db: DbClient,
  threadId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE guest_threads
    SET unread_count = 0,
        owner_last_seen_at = ?,
        updated_at = ?
    WHERE id = ?
  `, [now, now, threadId])
}

export async function updateGuestThreadInboxStatus(
  db: DbClient,
  threadId: string,
  inboxStatus: GuestThreadInboxStatus,
): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE guest_threads
    SET inbox_status = ?, updated_at = ?
    WHERE id = ?
  `, [inboxStatus, now, threadId])
}
