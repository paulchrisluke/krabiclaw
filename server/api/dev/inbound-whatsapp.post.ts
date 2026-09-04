import { defineHandler } from 'nitro'
import { readBody } from 'nitro/h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import { findSubmissionByPhone } from '~/server/utils/submission-messages'
import { parsePhoneOrThrow } from '~/utils/phone'
import { getAdapter } from '~/server/domain/guest-threads/adapters/registry'
import { ensureGuestThread, updateThreadProjectionIfLatestEntry } from '~/server/domain/guest-threads/repository'
import { appendEntry } from '~/server/domain/guest-threads/entries'
import { nextConversationState } from '~/server/domain/guest-threads/state-machine'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { notifyGuestThreadReply } from '~/server/utils/notifications'

export default defineHandler(async (event) => {
  assertDevRouteAllowed(event)
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const body = await readBody(event) as {
    from?: string
    body?: string
    messageId?: string
    organizationId?: string
    siteId?: string
  }

  const from = body.from?.trim()
  const text = body.body?.trim()
  if (!from || !text) {
    return jsonResponse({ error: 'from and body are required' }, { status: 400 })
  }

  const match = await findSubmissionByPhone(
    db, parsePhoneOrThrow(from, { defaultCountry: 'TH' }), body.organizationId?.trim() || undefined, body.siteId?.trim() || undefined, )
  if (!match) {
    return jsonResponse({ error: 'Submission not found for phone' }, { status: 404 })
  }

  const messageId = body.messageId?.trim() || crypto.randomUUID()
  const adapter = getAdapter(match.submissionType)
  const thread = await ensureGuestThread(db, adapter, match.submissionId)
  const entry = await appendEntry(db, {
    threadId: thread.id, organizationId: match.organizationId, siteId: match.siteId, kind: 'message', actorKind: 'guest', channel: 'whatsapp', body: text, dedupeKey: `whatsapp:${messageId}`, })
  const conversationState = nextConversationState(thread.conversation_state, { type: 'inbound_guest_message' })
  await updateThreadProjectionIfLatestEntry(db, thread.id, entry.id, { conversationState })

  const source = await adapter.loadSource({ db }, match.submissionId)
  if (source) {
    const summary = adapter.summarize(source)
    await notifyGuestThreadReply(env, db, {
      organizationId: match.organizationId, siteId: match.siteId, locationId: summary.locationId, threadId: thread.id, sourceEntryId: entry.id, submissionType: match.submissionType, submissionId: match.submissionId, guestName: summary.guestName, guestEmail: summary.guestEmail, guestPhone: summary.guestPhone, inboundChannel: 'whatsapp', messagePreview: text, })
  }
  await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'entry.appended' })

  return jsonResponse({ received: true, match, messageId })
})
