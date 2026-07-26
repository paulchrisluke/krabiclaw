import type { H3Event } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  buildReplyToAddress,
  getSubmissionOrgSite,
  type SubmissionType,
} from '~/server/utils/submission-messages'
import { getAdapter } from '~/server/domain/guest-threads/adapters/registry'
import { ensureGuestThread, updateThreadProjection } from '~/server/domain/guest-threads/repository'
import { appendEntry } from '~/server/domain/guest-threads/entries'
import { nextConversationState } from '~/server/domain/guest-threads/state-machine'
import { notifyGuestThreadReply } from '~/server/utils/notifications'

const enc = new TextEncoder()

function timingSafeEqualText(a: string, b: string): boolean {
  const left = enc.encode(a)
  const right = enc.encode(b)
  if (left.length !== right.length) {
    let _noop = 0
    for (let i = 0; i < left.length; i += 1) _noop |= left[i]!
    return false
  }
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!
  return diff === 0
}

function ensureDevAccess(event: H3Event) {
  const devMode = import.meta.dev
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!devMode && !e2eOverride) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (!devMode && e2eOverride) {
    const expected = process.env.E2E_DEV_ROUTE_SECRET || ''
    const provided = getHeader(event, 'x-dev-route-secret') || ''
    if (!expected || !provided || !timingSafeEqualText(provided, expected)) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }
}

export default defineEventHandler(async (event) => {
  ensureDevAccess(event)

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
    threadId: thread.id,
    organizationId: orgSite.organizationId,
    siteId: orgSite.siteId,
    kind: 'message',
    actorKind: 'guest',
    channel: 'email',
    body: body.body.trim(),
    externalId: messageId,
  })
  if (entry.created) {
    const conversationState = nextConversationState(thread.conversation_state, { type: 'inbound_guest_message' })
    await updateThreadProjection(db, thread.id, { conversationState })

    const source = await adapter.loadSource({ db }, body.submissionId)
    if (source) {
      const summary = adapter.summarize(source)
      await notifyGuestThreadReply(env, db, {
        organizationId: orgSite.organizationId,
        siteId: orgSite.siteId,
        locationId: summary.locationId,
        threadId: thread.id,
        submissionType: body.submissionType,
        submissionId: body.submissionId,
        guestName: summary.guestName,
        guestEmail: summary.guestEmail,
        guestPhone: summary.guestPhone,
        inboundChannel: 'email',
        messagePreview: body.body.trim(),
      })
    }
  }

  return jsonResponse({ received: true, replyTo, messageId })
})
