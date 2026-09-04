import { defineHandler } from 'nitro'
import { readBody } from 'nitro/h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import {
  buildReplyToAddress, getSubmissionOrgSite, type SubmissionType, } from '~/server/utils/submission-messages'
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
    submissionType?: SubmissionType
    submissionId?: string
    from?: string
    body?: string
    messageId?: string
  }

  if (!body.submissionType || !body.submissionId || !body.body?.trim()) {
    return jsonResponse({ error: 'submissionType, submissionId, and body are required' }, { status: 400 })
  }

  const replyTo = await buildReplyToAddress(env, body.submissionType, body.submissionId)
  if (!replyTo) {
    return jsonResponse({ error: 'EMAIL_REPLY_SECRET is not configured' }, { status: 400 })
  }

  const orgSite = await getSubmissionOrgSite(db, body.submissionType, body.submissionId)
  if (!orgSite) {
    return jsonResponse({ error: 'Submission not found' }, { status: 404 })
  }

  const messageId = body.messageId?.trim() || crypto.randomUUID()
  const adapter = getAdapter(body.submissionType)
  const thread = await ensureGuestThread(db, adapter, body.submissionId)
  const entry = await appendEntry(db, {
    threadId: thread.id, organizationId: orgSite.organizationId, siteId: orgSite.siteId, kind: 'message', actorKind: 'guest', channel: 'email', body: body.body.trim(), dedupeKey: `email:${messageId}`, })
  const conversationState = nextConversationState(thread.conversation_state, { type: 'inbound_guest_message' })
  await updateThreadProjectionIfLatestEntry(db, thread.id, entry.id, { conversationState })

  const source = await adapter.loadSource({ db }, body.submissionId)
  if (source) {
    const summary = adapter.summarize(source)
    await notifyGuestThreadReply(env, db, {
      organizationId: orgSite.organizationId, siteId: orgSite.siteId, locationId: summary.locationId, threadId: thread.id, sourceEntryId: entry.id, submissionType: body.submissionType, submissionId: body.submissionId, guestName: summary.guestName, guestEmail: summary.guestEmail, guestPhone: summary.guestPhone, inboundChannel: 'email', messagePreview: body.body.trim(), })
  }
  await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'entry.appended' })

  return jsonResponse({ received: true, replyTo, messageId })
})
