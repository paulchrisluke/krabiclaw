import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { listAccessibleLocationIds, type MemberAccessPrincipal } from '~/server/utils/member-access'
import type { ReplyEmailEnv } from '~/server/utils/submission-messages'

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
  location_title: string | null
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

export interface ContactSubmissionAssignment {
  selectedLocation: { id: string; title: string } | null
  experience: { id: string; title: string; location_id: string } | null
  assignedLocationId: string | null
  error: string | null
}

export interface GuestThreadOperationSummary {
  openThreads: number
  unreadThreads: number
  reservations: number
  experienceBookings: number
}

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

export async function resolveContactSubmissionAssignment(
  db: DbClient,
  opts: {
    siteId: string
    locationId?: string | null
    experienceId?: string | null
  },
): Promise<ContactSubmissionAssignment> {
  let selectedLocation: ContactSubmissionAssignment['selectedLocation'] = null
  if (opts.locationId) {
    selectedLocation = await queryFirst<{ id: string; title: string }>(
      db,
      'SELECT id, title FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1',
      [opts.locationId, opts.siteId],
    )
    if (!selectedLocation) {
      return {
        selectedLocation: null,
        experience: null,
        assignedLocationId: null,
        error: 'location_id must reference a location on this site',
      }
    }
  }

  let experience: ContactSubmissionAssignment['experience'] = null
  if (opts.experienceId) {
    experience = await queryFirst<{ id: string; title: string; location_id: string }>(
      db,
      'SELECT id, title, location_id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1',
      [opts.experienceId, opts.siteId],
    )
  }

  return {
    selectedLocation,
    experience,
    assignedLocationId: experience?.location_id ?? selectedLocation?.id ?? null,
    error: null,
  }
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
        COALESCE(ct.location_id, e.location_id) AS location_id,
        ct.name AS guest_name,
        ct.email AS guest_email,
        NULL AS guest_phone,
        ct.created_at,
        ct.status AS operational_status,
        ct.subject,
        ct.message,
        bl.title AS location_title,
        e.title AS experience_title,
        'contact' AS submission_type
      FROM contact_submissions ct
      LEFT JOIN experiences e ON e.id = ct.experience_id
      LEFT JOIN business_locations bl ON bl.id = COALESCE(ct.location_id, e.location_id)
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

  if (submissionType === 'experience_booking') {
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

  return null
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
  const source = await getGuestThreadSource(db, submissionType, submissionId)
  if (!source) throw new Error('Submission not found')
  if (existing) {
    if ((existing.location_id ?? null) !== (source.location_id ?? null)) {
      const now = new Date().toISOString()
      await execute(db, `
        UPDATE guest_threads
        SET location_id = ?, updated_at = ?
        WHERE id = ?
      `, [source.location_id, now, existing.id])
      return { ...existing, location_id: source.location_id, updated_at: now }
    }
    return existing
  }

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
    principal?: MemberAccessPrincipal | null
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

export async function getGuestThreadOperationSummary(
  db: DbClient,
  siteId: string,
  opts: {
    locationId?: string | null
    principal?: MemberAccessPrincipal | null
  } = {},
): Promise<GuestThreadOperationSummary> {
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

  const counts = await queryFirst<GuestThreadOperationSummary>(db, `
    SELECT
      SUM(CASE WHEN gt.inbox_status != 'closed' THEN 1 ELSE 0 END) AS openThreads,
      SUM(CASE WHEN gt.unread_count > 0 THEN 1 ELSE 0 END) AS unreadThreads,
      SUM(CASE WHEN gt.inbox_status != 'closed' AND gt.submission_type = 'reservation' THEN 1 ELSE 0 END) AS reservations,
      SUM(CASE WHEN gt.inbox_status != 'closed' AND gt.submission_type = 'experience_booking' THEN 1 ELSE 0 END) AS experienceBookings
    FROM guest_threads gt
    WHERE ${where}
  `, params)

  return {
    openThreads: counts?.openThreads ?? 0,
    unreadThreads: counts?.unreadThreads ?? 0,
    reservations: counts?.reservations ?? 0,
    experienceBookings: counts?.experienceBookings ?? 0,
  }
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

// Canonical "send an owner reply into a guest thread" implementation — the only place
// this logic should exist (see issue #293 Section C.1: "reuse canonical thread
// authorization, message persistence, delivery, audit ... do not fork a shadow reply
// implementation"). Both the dashboard HTTP route
// (server/api/dashboard/sites/[siteId]/guest-threads/[threadId]/reply.post.ts) and the
// WhatsApp inbound webhook (server/api/whatsapp/webhook.post.ts) call this function
// directly rather than one calling the other's HTTP endpoint — a nested self-fetch from
// the webhook would lose the Cloudflare `env`/`db` bindings per this repo's SSR rule.
//
// Deliberately does NOT re-check site/member authorization — callers authorize the
// sender against the target thread's site/location using whatever mechanism fits their
// entry point (requireSiteAccess + assertMemberScope for the HTTP route,
// isAuthorizedWhatsAppRecipient for the WhatsApp webhook) *before* calling this
// function. `senderUserId` is the Better Auth user id to attribute the message to; it is
// not a member id, since insertSubmissionMessage.sender_user_id references `user.id`.
export type PostGuestThreadReplyOutcome =
  | { ok: true; status: 200; messageId?: string; duplicate?: boolean }
  | { ok: true; status: 207; messageId?: string; error: string }
  | { ok: false; status: 404; reason: 'thread_not_found' }
  | { ok: false; status: 400; reason: 'no_guest_email' | 'empty_body' }
  | { ok: false; status: 502; reason: 'send_failed'; error: string; persisted: boolean }

export async function postGuestThreadReply(
  db: DbClient,
  env: ReplyEmailEnv,
  opts: {
    threadId: string
    siteId: string
    senderUserId: string
    body: string
  },
): Promise<PostGuestThreadReplyOutcome> {
  // Deferred import to avoid a module-init-time circular dependency with
  // submission-messages.ts, which itself imports several helpers from this file
  // (ensureGuestThread, syncGuestThreadAfterMessage, attachThreadToSubmissionMessages).
  // Both call sites only invoke this function from inside another function body (never
  // at module top-level), so the circularity is safe at runtime.
  const { sendReplyEmail, insertSubmissionMessage } = await import('~/server/utils/submission-messages')

  const detail = await getGuestThreadDetail(db, opts.threadId, opts.siteId)
  if (!detail) return { ok: false, status: 404, reason: 'thread_not_found' }
  if (!detail.source.guest_email) return { ok: false, status: 400, reason: 'no_guest_email' }

  const replyBody = opts.body.trim()

  // Reject empty trimmed bodies before deduplication check
  if (!replyBody) {
    return { ok: false, status: 400, reason: 'empty_body' }
  }

  // Guards against duplicate sends when a client retries after a network error or a
  // 207 (email sent, DB write failed) response — same thread + identical body within a
  // short window is treated as the same submission rather than sent again.
  const dedupeWindowStart = new Date(Date.now() - 30_000).toISOString()
  const recentDuplicate = await queryFirst<{ id: string }>(db, `
    SELECT id FROM submission_messages
    WHERE thread_id = ? AND direction = 'out' AND body = ? AND created_at > ?
    ORDER BY created_at DESC LIMIT 1
  `, [detail.thread.id, replyBody, dedupeWindowStart])
  if (recentDuplicate) {
    return { ok: true, status: 200, duplicate: true }
  }

  const siteRow = await queryFirst<{ brand_name: string | null }>(db, `SELECT brand_name FROM sites WHERE id = ? LIMIT 1`, [opts.siteId])
  const fromName = siteRow?.brand_name || 'KrabiClaw'
  const subject = detail.source.submission_type === 'contact'
    ? `Re: your message to ${fromName}`
    : detail.source.submission_type === 'reservation'
      ? `Re: your reservation at ${fromName}`
      : `Re: your booking at ${fromName}`

  const result = await sendReplyEmail(env, {
    to: detail.source.guest_email,
    fromName,
    subject,
    body: replyBody,
    submissionType: detail.thread.submission_type,
    submissionId: detail.thread.submission_id,
  })

  let persisted = true
  try {
    await insertSubmissionMessage(db, {
      submissionType: detail.thread.submission_type,
      submissionId: detail.thread.submission_id,
      organizationId: detail.thread.organization_id,
      siteId: opts.siteId,
      direction: 'out',
      channel: 'email',
      body: replyBody,
      senderUserId: opts.senderUserId,
      metaMessageId: result.messageId ?? null,
      status: result.success ? 'sent' : 'failed',
      error: result.error ?? null,
    })
  } catch (error) {
    persisted = false
    console.error('Failed to save guest thread reply to database', error)
  }

  if (!result.success) {
    return { ok: false, status: 502, reason: 'send_failed', error: result.error || 'Failed to send reply', persisted }
  }

  if (!persisted) {
    return { ok: true, status: 207, messageId: result.messageId, error: 'Reply email was sent, but the thread could not be updated. Refresh to check its status.' }
  }

  return { ok: true, status: 200, messageId: result.messageId }
}
