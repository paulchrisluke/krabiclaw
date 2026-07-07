import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { getGuestThreadDetail } from '~/server/utils/guest-threads'
import { insertSubmissionMessage, sendReplyEmail } from '~/server/utils/submission-messages'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const threadId = getRouterParam(event, 'threadId')
  if (!siteId || !threadId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { env, db, session, site } = await requireSiteAccess(event, siteId, ['owner', 'admin'])
  const body = await readBody(event) as { channel?: unknown; body?: unknown }
  const channel = body.channel
  const replyBody = typeof body.body === 'string' ? body.body.trim() : ''
  if (channel !== 'email') {
    return jsonResponse({ error: 'Guest thread replies are email-only in v1' }, { status: 400 })
  }
  if (!replyBody) {
    return jsonResponse({ error: 'Reply body is required' }, { status: 400 })
  }

  const detail = await getGuestThreadDetail(db, threadId, siteId)
  if (!detail) return jsonResponse({ error: 'Thread not found' }, { status: 404 })
  if (!detail.source.guest_email) {
    return jsonResponse({ error: 'This guest has no email on file' }, { status: 400 })
  }

  const siteRow = await queryFirst<{ brand_name: string | null }>(db, `SELECT brand_name FROM sites WHERE id = ? LIMIT 1`, [siteId])
  const fromName = siteRow?.brand_name || 'KrabiClaw'
  const subject = detail.source.submission_type === 'contact'
    ? `Re: your message to ${fromName}`
    : detail.source.submission_type === 'reservation'
      ? `Re: your reservation at ${fromName}`
      : `Re: your booking at ${fromName}`

  const result = await sendReplyEmail(env, {
    to: detail.source.guest_email,
    fromName,
    subject,
    body: replyBody,
    submissionType: detail.thread.submission_type,
    submissionId: detail.thread.submission_id,
  })

  let persisted = true
  try {
    await insertSubmissionMessage(db, {
      submissionType: detail.thread.submission_type,
      submissionId: detail.thread.submission_id,
      organizationId: site.organization_id,
      siteId,
      direction: 'out',
      channel: 'email',
      body: replyBody,
      senderUserId: session.user.id,
      metaMessageId: result.messageId ?? null,
      status: result.success ? 'sent' : 'failed',
      error: result.error ?? null,
    })
  } catch (error) {
    persisted = false
    console.error('Failed to save guest thread reply to database', error)
  }

  if (!result.success) {
    return jsonResponse({ error: result.error || 'Failed to send reply', persisted }, { status: 502 })
  }

  if (!persisted) {
    return jsonResponse({ sent: true, persisted: false, error: 'Reply email was sent, but the thread could not be updated. Refresh to check its status.' }, { status: 207 })
  }

  return jsonResponse({ sent: true, persisted: true })
})
