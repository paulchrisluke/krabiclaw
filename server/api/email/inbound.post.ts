// POST /api/email/inbound
// Called by the separate krabiclaw-email-inbound Cloudflare Email Worker (workers/email-inbound/)
// after it parses a reply sent to reply+<type>-<id>-<token>@reply.<platform-domain>. Authenticated by
// a shared secret header, not a dashboard session — the caller is a Worker, not a browser.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { execute, executeBatch } from '~/server/db'
import { insertDashboardNotification } from '~/server/utils/notifications'
import {
  getSubmissionOrgSite,
  insertSubmissionMessage,
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

  const body = await readBody(event) as { to?: unknown; from?: unknown; body?: unknown }
  const to = typeof body.to === 'string' ? body.to : ''
  const from = typeof body.from === 'string' ? body.from : ''
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!to || !text) return jsonResponse({ error: 'Missing to/body' }, { status: 400 })

  const parsed = parseReplyToAddress(to)
  if (!parsed || !isSubmissionType(parsed.submissionType)) {
    return jsonResponse({ error: 'Unrecognized reply address' }, { status: 400 })
  }

  const isValid = await verifyReplyToken(env, parsed.submissionType, parsed.submissionId, parsed.token)
  if (!isValid) return jsonResponse({ error: 'Invalid reply token' }, { status: 403 })

  const orgSite = await getSubmissionOrgSite(db, parsed.submissionType, parsed.submissionId)
  if (!orgSite) return jsonResponse({ error: 'Submission not found' }, { status: 404 })

  // Idempotency check: use the reply-to address (which includes the token) as a unique key
  // to prevent duplicate processing on retries
  const existing = await execute(db, `SELECT id FROM submission_messages WHERE meta_message_id = ? LIMIT 1`, [to])
  if (existing) return jsonResponse({ received: true })

  const messageId = crypto.randomUUID()
  const notificationId = crypto.randomUUID()
  const now = new Date().toISOString()
  await executeBatch(db, [
    {
      query: `
        INSERT INTO submission_messages
        (id, submission_type, submission_id, organization_id, site_id, direction, channel, body, sender_user_id, meta_message_id, status, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        messageId,
        parsed.submissionType,
        parsed.submissionId,
        orgSite.organizationId,
        orgSite.siteId,
        'in',
        'email',
        text,
        null,
        to,
        'sent',
        null,
        now
      ]
    },
    {
      query: `
        INSERT INTO notifications
        (id, organization_id, site_id, location_id, channel, template, title, payload, status, sent_at, created_at)
        VALUES (?, ?, ?, ?, 'dashboard', ?, ?, ?, 'sent', ?, ?)
      `,
      params: [
        notificationId,
        orgSite.organizationId,
        orgSite.siteId,
        null,
        'submission_reply_email',
        'New email reply from a guest',
        JSON.stringify({ submission_type: parsed.submissionType, submission_id: parsed.submissionId, from, message: text }),
        now,
        now
      ]
    }
  ])

  return jsonResponse({ received: true })
})
