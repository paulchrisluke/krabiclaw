// POST /api/email/inbound
// Called by the separate krabiclaw-email-inbound Cloudflare Email Worker (workers/email-inbound/)
// after it parses a reply sent to reply+<type>-<id>-<token>@reply.<platform-domain>. Authenticated by
// a shared secret header, not a dashboard session — the caller is a Worker, not a browser.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyGuestThreadReply } from '~/server/utils/notifications'
import {
  getSubmissionOrgSite,
  isSubmissionType,
  parseReplyToAddress,
  verifyReplyToken,
} from '~/server/utils/submission-messages'
import { getAdapter } from '~/server/domain/guest-threads/adapters/registry'
import { ensureGuestThread, updateThreadProjection } from '~/server/domain/guest-threads/repository'
import { appendEntry } from '~/server/domain/guest-threads/entries'
import { nextConversationState } from '~/server/domain/guest-threads/state-machine'

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

  const adapter = getAdapter(parsed.submissionType)
  const thread = await ensureGuestThread(db, adapter, parsed.submissionId)

  // Idempotent on the inbound provider message id via the ledger's external_id unique
  // index — a retried delivery from the email worker appends nothing new and returns
  // the existing entry.
  const entry = await appendEntry(db, {
    threadId: thread.id,
    organizationId: orgSite.organizationId,
    siteId: orgSite.siteId,
    kind: 'message',
    actorKind: 'guest',
    channel: 'email',
    body: text,
    externalId: messageIdHeader,
  })

  const alreadyProcessed = entry.body !== text
  if (!alreadyProcessed) {
    const conversationState = nextConversationState(thread.conversation_state, { type: 'inbound_guest_message' })
    await updateThreadProjection(db, thread.id, { conversationState })
  }

  if (!alreadyProcessed) {
    try {
      const source = await adapter.loadSource({ db }, parsed.submissionId)
      if (source) {
        const summary = adapter.summarize(source)
        await notifyGuestThreadReply(env, db, {
          organizationId: orgSite.organizationId,
          siteId: orgSite.siteId,
          locationId: summary.locationId,
          threadId: thread.id,
          submissionType: parsed.submissionType,
          submissionId: parsed.submissionId,
          guestName: summary.guestName,
          guestEmail: summary.guestEmail,
          guestPhone: summary.guestPhone,
          inboundChannel: 'email',
          messagePreview: text,
        })
      }
    } catch (err) {
      console.error('[email-inbound] Failed to notify owner of guest reply:', {
        submissionType: parsed.submissionType,
        submissionId: parsed.submissionId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // `from` is currently unused beyond routing (the reply address encodes submission
  // identity), kept in the payload contract for the email worker's own logging.
  void from

  return jsonResponse({ received: true })
})
