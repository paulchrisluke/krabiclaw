// POST /api/email/inbound
// Called by the separate krabiclaw-email-inbound Cloudflare Email Worker (workers/email-inbound/)
// after it parses a reply sent to reply+<type>-<id>-<token>@reply.<platform-domain>. Authenticated by
// a shared secret header, not a dashboard session — the caller is a Worker, not a browser.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { ensureGuestThread, getGuestThreadSource } from '~/server/utils/guest-threads'
import { notifyGuestThreadReply } from '~/server/utils/notifications'
import {
  getSubmissionOrgSite,
  insertInboundSubmissionReply,
  isSubmissionType,
  parseReplyToAddress,
  verifyReplyToken,
} from '~/server/utils/submission-messages'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const secret = getHeader(event, 'x-email-inbound-secret')
  if (!env.EMAIL_INBOUND_SECRET || secret !== env.EMAIL_INBOUND_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readBody(event) as { to?: unknown; from?: unknown; body?: unknown; messageId?: unknown }
  const to = typeof body.to === 'string' ? body.to : ''
  const from = typeof body.from === 'string' ? body.from : ''
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  const messageIdHeader = typeof body.messageId === 'string' ? body.messageId : crypto.randomUUID()
  if (!to || !text) return jsonResponse({ error: 'Missing to/body' }, { status: 400 })

  const parsed = parseReplyToAddress(to)
  if (!parsed || !isSubmissionType(parsed.submissionType)) {
    return jsonResponse({ error: 'Unrecognized reply address' }, { status: 400 })
  }

  const isValid = await verifyReplyToken(env, parsed.submissionType, parsed.submissionId, parsed.token)
  if (!isValid) return jsonResponse({ error: 'Invalid reply token' }, { status: 403 })

  const orgSite = await getSubmissionOrgSite(db, parsed.submissionType, parsed.submissionId)
  if (!orgSite) return jsonResponse({ error: 'Submission not found' }, { status: 404 })

  // Idempotency check: use the message-id from headers as a unique key
  // to prevent duplicate processing on retries
  const existing = await queryFirst<{ id: string }>(db, `SELECT id FROM submission_messages WHERE meta_message_id = ? LIMIT 1`, [messageIdHeader])
  if (existing) return jsonResponse({ received: true })

  await insertInboundSubmissionReply(db, {
    submissionType: parsed.submissionType,
    submissionId: parsed.submissionId,
    organizationId: orgSite.organizationId,
    siteId: orgSite.siteId,
    channel: 'email',
    body: text,
    metaMessageId: messageIdHeader,
    from,
  })

  const thread = await ensureGuestThread(db, parsed.submissionType, parsed.submissionId)
  const source = await getGuestThreadSource(db, parsed.submissionType, parsed.submissionId)
  if (source) {
    await notifyGuestThreadReply(env, db, {
      organizationId: orgSite.organizationId,
      siteId: orgSite.siteId,
      locationId: source.location_id,
      threadId: thread.id,
      submissionType: parsed.submissionType,
      submissionId: parsed.submissionId,
      guestName: source.guest_name,
      guestEmail: source.guest_email,
      guestPhone: source.guest_phone,
      inboundChannel: 'email',
      messagePreview: text,
    })
  }

  return jsonResponse({ received: true })
})
