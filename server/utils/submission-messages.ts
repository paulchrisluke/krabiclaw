import { execute, queryFirst, type DbClient } from '~/server/db'
import { logOnlyEmailProviderId, shouldSendRealEmail } from '~/server/utils/email-delivery'

export type SubmissionType = 'contact' | 'reservation' | 'experience_booking'

interface ReplyAddressEnv {
  EMAIL_REPLY_SECRET?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

// reply.<platform-domain>, e.g. reply.krabiclaw.com — no separate env var needed since it's
// derived from the same NUXT_PUBLIC_PLATFORM_DOMAIN every other outbound link already uses.
function getReplyDomain(env: ReplyAddressEnv): string {
  const platformDomain = (env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `reply.${platformDomain}`
}

interface ReplyEmailEnv extends ReplyAddressEnv {
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  EMAIL_DELIVERY_MODE?: string
}

const TOKEN_BYTES = 16

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, TOKEN_BYTES * 2)
}

// Builds a plus-addressed reply-to like reply+reservation-<id>-<hmac>@reply.krabiclaw.com so an
// inbound reply can be verified and matched back to the exact submission without a DB lookup by address.
export async function buildReplyToAddress(
  env: ReplyAddressEnv,
  submissionType: SubmissionType,
  submissionId: string,
): Promise<string | null> {
  if (!env.EMAIL_REPLY_SECRET) return null
  const token = await hmacHex(env.EMAIL_REPLY_SECRET, `${submissionType}:${submissionId}`)
  return `reply+${submissionType}-${submissionId}-${token}@${getReplyDomain(env)}`
}

export async function verifyReplyToken(
  env: ReplyAddressEnv,
  submissionType: string,
  submissionId: string,
  token: string,
): Promise<boolean> {
  if (!env.EMAIL_REPLY_SECRET) return false
  const expected = await hmacHex(env.EMAIL_REPLY_SECRET, `${submissionType}:${submissionId}`)
  return expected === token
}

export function parseReplyToAddress(address: string): { submissionType: string; submissionId: string; token: string } | null {
  const local = address.split('@')[0] ?? ''
  const match = /^reply\+([a-z_]+)-(.+)-([0-9a-f]{32})$/.exec(local)
  if (!match) return null
  return { submissionType: match[1]!, submissionId: match[2]!, token: match[3]! }
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
export async function findSubmissionByPhone(db: DbClient, phone: string): Promise<SubmissionMatch | null> {
  const reservation = await queryFirst<{ id: string; organization_id: string; site_id: string }>(db, `
    SELECT id, organization_id, site_id FROM reservation_submissions
    WHERE phone = ? AND status != 'cancelled'
    ORDER BY created_at DESC LIMIT 1
  `, [phone])
  if (reservation) {
    return { submissionType: 'reservation', submissionId: reservation.id, organizationId: reservation.organization_id, siteId: reservation.site_id }
  }

  const booking = await queryFirst<{ id: string; organization_id: string; site_id: string }>(db, `
    SELECT id, organization_id, site_id FROM experience_bookings
    WHERE guest_phone = ? AND status != 'cancelled'
    ORDER BY created_at DESC LIMIT 1
  `, [phone])
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
    ? env.EMAIL_FROM.replace(/^[^<]*(?=<)/, `${opts.fromName} `)
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
  await execute(db, `
    INSERT INTO submission_messages
    (id, submission_type, submission_id, organization_id, site_id, direction, channel, body, sender_user_id, meta_message_id, status, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
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
    new Date().toISOString(),
  ])
  return id
}
