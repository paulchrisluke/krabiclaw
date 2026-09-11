import { queryFirst, type DbClient } from '~/server/db'
import { sendEmail } from '~/server/utils/email-delivery'
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

export interface ReplyEmailEnv extends ReplyAddressEnv {
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

export function parseReplyToAddress(env: ReplyAddressEnv, address: string): { submissionType: ReplySubmissionType; submissionId: string; token: string } | null {
  const parts = address.split('@')
  if (parts.length !== 2 || parts[1]?.toLowerCase() !== getReplyDomain(env).toLowerCase()) return null
  return parseReplyLocalPart(parts[0] ?? '')
}

export function isSubmissionType(value: string): value is SubmissionType {
  return value === 'contact' || value === 'reservation' || value === 'booking'
}

export async function getSubmissionOrgSite(db: DbClient, submissionType: SubmissionType, submissionId: string): Promise<{ organizationId: string; siteId: string } | null> {
  const row = await queryFirst<{ organization_id: string; site_id: string }>(db, 'SELECT organization_id, site_id FROM requests WHERE kind = ? AND id = ?', [submissionType, submissionId])
  return row ? { organizationId: row.organization_id, siteId: row.site_id } : null
}

export interface SubmissionContact {
  email: string | null
  phone: string | null
  organizationId: string
  siteId: string
}

export async function getSubmissionContact(db: DbClient, siteId: string, submissionType: SubmissionType, submissionId: string): Promise<SubmissionContact | null> {
  return queryFirst<SubmissionContact>(db, `SELECT organization_id AS organizationId, site_id AS siteId, json_extract(payload_json, '$.guest.email') AS email, json_extract(payload_json, '$.guest.phone') AS phone FROM requests WHERE id = ? AND site_id = ? AND kind = ?`, [submissionId, siteId, submissionType])
}

export interface SubmissionMatch {
  submissionType: SubmissionType
  submissionId: string
  organizationId: string
  siteId: string
}

export async function findSubmissionByPhone(db: DbClient, phone: string, organizationId?: string, siteId?: string): Promise<SubmissionMatch | null> {
  return queryFirst<SubmissionMatch>(db, `SELECT kind AS submissionType, id AS submissionId, organization_id AS organizationId, site_id AS siteId FROM requests
    WHERE kind IN ('reservation', 'booking') AND json_extract(payload_json, '$.guest.phone') = ? AND status != 'cancelled'
    ${organizationId ? 'AND organization_id = ?' : ''} ${siteId ? 'AND site_id = ?' : ''}
    ORDER BY created_at DESC LIMIT 1`, [phone, ...(organizationId ? [organizationId] : []), ...(siteId ? [siteId] : [])])
}

export interface SendReplyEmailResult {
  status: 'sent' | 'failed' | 'unknown'
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
  idempotencyKey?: string
}): Promise<SendReplyEmailResult> {
  const replyTo = await buildReplyToAddress(env, opts.submissionType, opts.submissionId)
  const result = await sendEmail(env, {
    to: opts.to,
    fromName: opts.fromName,
    subject: opts.subject,
    text: opts.body,
    replyTo,
    idempotencyKey: opts.idempotencyKey,
  })
  return result.status === 'sent'
    ? { status: 'sent', ...(result.messageId ? { messageId: result.messageId } : {}) }
    : { status: result.status, error: result.error }
}
