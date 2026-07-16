import type { H3Event } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  buildReplyToAddress,
  getSubmissionOrgSite,
  insertInboundSubmissionReply,
  type SubmissionType,
} from '~/server/utils/submission-messages'

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
  await insertInboundSubmissionReply(env, db, {
    submissionType: body.submissionType,
    submissionId: body.submissionId,
    organizationId: orgSite.organizationId,
    siteId: orgSite.siteId,
    channel: 'email',
    body: body.body.trim(),
    metaMessageId: messageId,
    from: body.from?.trim() || 'guest@example.test',
  })

  return jsonResponse({ received: true, replyTo, messageId })
})
