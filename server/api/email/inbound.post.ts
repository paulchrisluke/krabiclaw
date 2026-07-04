// POST /api/email/inbound
// Called by the separate krabiclaw-email-inbound Cloudflare Email Worker (workers/email-inbound/)
// after it parses a reply sent to reply+<type>-<id>-<token>@reply.<platform-domain>. Authenticated by
// a shared secret header, not a dashboard session — the caller is a Worker, not a browser.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
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

  await insertSubmissionMessage(db, {
    submissionType: parsed.submissionType,
    submissionId: parsed.submissionId,
    organizationId: orgSite.organizationId,
    siteId: orgSite.siteId,
    direction: 'in',
    channel: 'email',
    body: text,
  })

  await insertDashboardNotification(db, {
    organizationId: orgSite.organizationId,
    siteId: orgSite.siteId,
    template: 'submission_reply_email',
    title: 'New email reply from a guest',
    payload: { submission_type: parsed.submissionType, submission_id: parsed.submissionId, from, message: text },
  })

  return jsonResponse({ received: true })
})
