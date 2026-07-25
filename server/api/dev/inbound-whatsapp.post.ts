import type { H3Event } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { findSubmissionByPhone } from '~/server/utils/submission-messages'
import { parsePhoneOrThrow } from '~/utils/phone'
import { getAdapter } from '~/server/domain/guest-threads/adapters/registry'
import { ensureGuestThread, updateThreadProjection } from '~/server/domain/guest-threads/repository'
import { appendEntry } from '~/server/domain/guest-threads/entries'
import { nextConversationState } from '~/server/domain/guest-threads/state-machine'

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
    db,
    parsePhoneOrThrow(from, { defaultCountry: 'TH' }),
    body.organizationId?.trim() || undefined,
    body.siteId?.trim() || undefined,
  )
  if (!match) {
    return jsonResponse({ error: 'Submission not found for phone' }, { status: 404 })
  }

  const messageId = body.messageId?.trim() || crypto.randomUUID()
  const adapter = getAdapter(match.submissionType)
  const thread = await ensureGuestThread(db, adapter, match.submissionId)
  const entry = await appendEntry(db, {
    threadId: thread.id,
    organizationId: match.organizationId,
    siteId: match.siteId,
    kind: 'message',
    actorKind: 'guest',
    channel: 'whatsapp',
    body: text,
    externalId: messageId,
  })
  if (entry.body === text) {
    const conversationState = nextConversationState(thread.conversation_state, { type: 'inbound_guest_message' })
    await updateThreadProjection(db, thread.id, { conversationState })
  }

  return jsonResponse({ received: true, match, messageId })
})
