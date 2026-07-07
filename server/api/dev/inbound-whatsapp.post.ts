import type { H3Event } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { findSubmissionByPhone, insertInboundSubmissionReply } from '~/server/utils/submission-messages'
import { normalizePhone } from '~/server/utils/whatsapp'
import type { H3Event } from 'h3'

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
    normalizePhone(from),
    body.organizationId?.trim() || undefined,
    body.siteId?.trim() || undefined,
  )
  if (!match) {
    return jsonResponse({ error: 'Submission not found for phone' }, { status: 404 })
  }

  const messageId = body.messageId?.trim() || crypto.randomUUID()
  await insertInboundSubmissionReply(db, {
    submissionType: match.submissionType,
    submissionId: match.submissionId,
    organizationId: match.organizationId,
    siteId: match.siteId,
    channel: 'whatsapp',
    body: text,
    metaMessageId: messageId,
    from: normalizePhone(from),
  })

  return jsonResponse({ received: true, match, messageId })
})
