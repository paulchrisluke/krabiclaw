import { execute, executeBatch, queryFirst, type DbClient } from '~/server/db'
import { logOnlyEmailProviderId, shouldSendRealEmail } from '~/server/utils/email-delivery'
import { attachThreadToSubmissionMessages, ensureGuestThread, syncGuestThreadAfterMessage } from '~/server/utils/guest-threads'
import {
  buildReplyLocalPart,
  buildReplyToken,
  parseReplyLocalPart,
  verifyReplyTokenValue,
  type ReplySubmissionType,
} from '~/server/utils/reply-address'
import { getReplyDomain } from '~/server/utils/reply-domain'

export type SubmissionType = ReplySubmissionType

interface ReplyAddressEnv {
  EMAIL_REPLY_SECRET?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

interface ReplyEmailEnv extends ReplyAddressEnv {
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  EMAIL_DELIVERY_MODE?: string
}
 
// Builds a compact reply-to like r<type><uuid><hmac>@reply.krabiclaw.com so inbound replies stay
// under the 64-character local-part limit while still encoding the submission identity.
export async function buildReplyToAddress(
  env: ReplyAddressEnv,
  submissionType: SubmissionType,
  submissionId: string,
): Promise<string | null> {
  if (!env.EMAIL_REPLY_SECRET) return null
  const token = await buildReplyToken(env.EMAIL_REPLY_SECRET, submissionType, submissionId)
  const localPart = buildReplyLocalPart(submissionType, submissionId, token)
  if (!localPart) return null
  return `${localPart}@${getReplyDomain(env)}`
}

export async function verifyReplyToken(
  env: ReplyAddressEnv,
  submissionType: string,
  submissionId: string,
  token: string,
): Promise<boolean> {
  if (!env.EMAIL_REPLY_SECRET) return false
  return verifyReplyTokenValue(env.EMAIL_REPLY_SECRET, submissionType, submissionId, token)
}

export function parseReplyToAddress(address: string): { submissionType: string; submissionId: string; token: string } | null {
  const local = address.split('@')[0] ?? ''
  return parseReplyLocalPart(local)
}

const SUBMISSION_TABLES: Record<SubmissionType, string> = {
  contact: 'contact_submissions',
  reservation: 'reservation_submissions',
  experience_booking: 'experience_bookings',
}

export function isSubmissionType(value: string): value is SubmissionType {
  return value in SUBMISSION_TABLES
}

// Looks up organization/site scoping for a submission by type+id alone — used by the inbound
// email handler, which only has the type+id encoded in the reply-to address, not a siteId.
export async function getSubmissionOrgSite(
  db: DbClient,
  submissionType: SubmissionType,
  submissionId: string,
): Promise<{ organizationId: string; siteId: string } | null> {
  const table = SUBMISSION_TABLES[submissionType]
  const row = await queryFirst<{ organization_id: string; site_id: string }>(db, `
    SELECT organization_id, site_id FROM ${table} WHERE id = ? LIMIT 1
  `, [submissionId])
  if (!row) return null
  return { organizationId: row.organization_id, siteId: row.site_id }
}

export interface SubmissionContact {
  email: string | null
  phone: string | null
  organizationId: string
  siteId: string
}

export async function getSubmissionContact(
  db: DbClient,
  siteId: string,
  submissionType: SubmissionType,
  submissionId: string,
): Promise<SubmissionContact | null> {
  if (submissionType === 'contact') {
    const row = await queryFirst<{ email: string; organization_id: string; site_id: string }>(db, `
      SELECT email, organization_id, site_id FROM contact_submissions WHERE id = ? AND site_id = ? LIMIT 1
    `, [submissionId, siteId])
    if (!row) return null
    return { email: row.email, phone: null, organizationId: row.organization_id, siteId: row.site_id }
  }
  if (submissionType === 'reservation') {
    const row = await queryFirst<{ email: string; phone: string | null; organization_id: string; site_id: string }>(db, `
      SELECT email, phone, organization_id, site_id FROM reservation_submissions WHERE id = ? AND site_id = ? LIMIT 1
    `, [submissionId, siteId])
    if (!row) return null
    return { email: row.email, phone: row.phone, organizationId: row.organization_id, siteId: row.site_id }
  }
  const row = await queryFirst<{ guest_email: string; guest_phone: string | null; organization_id: string; site_id: string }>(db, `
    SELECT guest_email, guest_phone, organization_id, site_id FROM experience_bookings WHERE id = ? AND site_id = ? LIMIT 1
  `, [submissionId, siteId])
  if (!row) return null
  return { email: row.guest_email, phone: row.guest_phone, organizationId: row.organization_id, siteId: row.site_id }
}

export interface SubmissionMatch {
  submissionType: SubmissionType
  submissionId: string
  organizationId: string
  siteId: string
}

// Used by the WhatsApp inbound webhook to find which open thread a customer's message belongs to,
// since customers aren't KrabiClaw accounts and can't be matched by verified user phone number.
// Accepts optional organizationId/siteId for tenant scoping when context is known (e.g., email inbound).
export async function findSubmissionByPhone(db: DbClient, phone: string, organizationId?: string, siteId?: string): Promise<SubmissionMatch | null> {
  const reservationQuery = `
    SELECT id, organization_id, site_id FROM reservation_submissions
    WHERE phone = ? AND status != 'cancelled'
    ${organizationId ? 'AND organization_id = ?' : ''}
    ${siteId ? 'AND site_id = ?' : ''}
    ORDER BY created_at DESC LIMIT 1
  `
  const reservationParams: (string | number)[] = [phone]
  if (organizationId) reservationParams.push(organizationId)
  if (siteId) reservationParams.push(siteId)
  const reservation = await queryFirst<{ id: string; organization_id: string; site_id: string }>(db, reservationQuery, reservationParams)
  if (reservation) {
    return { submissionType: 'reservation', submissionId: reservation.id, organizationId: reservation.organization_id, siteId: reservation.site_id }
  }

  const bookingQuery = `
    SELECT id, organization_id, site_id FROM experience_bookings
    WHERE guest_phone = ? AND status != 'cancelled'
    ${organizationId ? 'AND organization_id = ?' : ''}
    ${siteId ? 'AND site_id = ?' : ''}
    ORDER BY created_at DESC LIMIT 1
  `
  const bookingParams: (string | number)[] = [phone]
  if (organizationId) bookingParams.push(organizationId)
  if (siteId) bookingParams.push(siteId)
  const booking = await queryFirst<{ id: string; organization_id: string; site_id: string }>(db, bookingQuery, bookingParams)
  if (booking) {
    return { submissionType: 'experience_booking', submissionId: booking.id, organizationId: booking.organization_id, siteId: booking.site_id }
  }

  return null
}

export interface SendReplyEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// Sends an owner's typed reply to a customer, with reply-to set so the customer's own reply
// lands back on the same thread. This is a one-off message, not a fixed notification template,
// so it bypasses the `notifications` table logging sendEmailNotification does for system emails.
export async function sendReplyEmail(env: ReplyEmailEnv, opts: {
  to: string
  fromName: string
  subject: string
  body: string
  submissionType: SubmissionType
  submissionId: string
}): Promise<SendReplyEmailResult> {
  const replyTo = await buildReplyToAddress(env, opts.submissionType, opts.submissionId)

  if (!shouldSendRealEmail(env)) {
    return { success: true, messageId: logOnlyEmailProviderId('reply') }
  }

  if (!env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const fromValue = env.EMAIL_FROM
    ? env.EMAIL_FROM.includes('<')
      ? env.EMAIL_FROM.replace(/^[^<]*(?=<)/, `${opts.fromName} `)
      : `${opts.fromName} <${env.EMAIL_FROM}>`
    : `${opts.fromName} <hello@krabiclaw.com>`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromValue,
        to: [opts.to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: opts.subject,
        text: opts.body,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    return { success: false, error: error instanceof Error ? error.message : 'Email request failed' }
  }
  clearTimeout(timeout)

  if (!response.ok) {
    return { success: false, error: await response.text() }
  }

  const data = await response.json().catch(() => ({})) as { id?: string }
  return { success: true, messageId: data.id }
}

export async function insertSubmissionMessage(db: DbClient, opts: {
  submissionType: SubmissionType
  submissionId: string
  organizationId: string
  siteId: string
  direction: 'in' | 'out'
  channel: 'email' | 'whatsapp'
  body: string
  senderUserId?: string | null
  metaMessageId?: string | null
  status?: string
  error?: string | null
}): Promise<string> {
  const id = crypto.randomUUID()
  const thread = await ensureGuestThread(db, opts.submissionType, opts.submissionId)
  const createdAt = new Date().toISOString()
  await execute(db, `
    INSERT INTO submission_messages
    (id, thread_id, submission_type, submission_id, organization_id, site_id, direction, channel, body, sender_user_id, meta_message_id, status, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    thread.id,
    opts.submissionType,
    opts.submissionId,
    opts.organizationId,
    opts.siteId,
    opts.direction,
    opts.channel,
    opts.body,
    opts.senderUserId ?? null,
    opts.metaMessageId ?? null,
    opts.status ?? 'sent',
    opts.error ?? null,
    createdAt,
  ])
  await syncGuestThreadAfterMessage(db, {
    threadId: thread.id,
    direction: opts.direction,
    body: opts.body,
    createdAt,
  })
  return id
}

export async function insertInboundSubmissionReply(db: DbClient, opts: {
  submissionType: SubmissionType
  submissionId: string
  organizationId: string
  siteId: string
  channel: 'email' | 'whatsapp'
  body: string
  metaMessageId?: string | null
  from?: string | null
}): Promise<string> {
  const thread = await ensureGuestThread(db, opts.submissionType, opts.submissionId)
  const messageId = crypto.randomUUID()
  const notificationId = crypto.randomUUID()
  const now = new Date().toISOString()
  const template = opts.channel === 'email' ? 'submission_reply_email' : 'submission_reply_whatsapp'
  const title = opts.channel === 'email' ? 'New email reply from a guest' : 'New WhatsApp reply from a guest'

  await executeBatch(db, [
    {
      query: `
        INSERT INTO submission_messages
        (id, thread_id, submission_type, submission_id, organization_id, site_id, direction, channel, body, sender_user_id, meta_message_id, status, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        messageId,
        thread.id,
        opts.submissionType,
        opts.submissionId,
        opts.organizationId,
        opts.siteId,
        'in',
        opts.channel,
        opts.body,
        null,
        opts.metaMessageId ?? null,
        'sent',
        null,
        now,
      ],
    },
    {
      query: `
        INSERT INTO notifications
        (id, organization_id, site_id, location_id, channel, template, title, payload, status, sent_at, created_at)
        VALUES (?, ?, ?, ?, 'dashboard', ?, ?, ?, 'sent', ?, ?)
      `,
      params: [
        notificationId,
        opts.organizationId,
        opts.siteId,
        null,
        template,
        title,
        JSON.stringify({
          submission_type: opts.submissionType,
          submission_id: opts.submissionId,
          from: opts.from ?? null,
          message: opts.body,
        }),
        now,
        now,
      ],
    },
  ])

  await attachThreadToSubmissionMessages(db, thread.id, opts.submissionType, opts.submissionId)
  await syncGuestThreadAfterMessage(db, {
    threadId: thread.id,
    direction: 'in',
    body: opts.body,
    createdAt: now,
  })

  return messageId
}
