// POST /api/editor/sites/[siteId]/reservation-submissions/[submissionId]/reply
// Owner/admin sends an email reply to the guest who made the reservation.
import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { queryFirst } from '~/server/db'
import { getSubmissionContact, insertSubmissionMessage, sendReplyEmail } from '~/server/utils/submission-messages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { env, db, session, site } = await requireSiteAccess(event, siteId, ['owner', 'admin'])

  const body = await readBody(event) as { channel?: unknown; body?: unknown }
  const channel = body.channel
  const replyBody = typeof body.body === 'string' ? body.body.trim() : ''
  if (channel !== 'email') {
    return jsonResponse({ error: 'Reservation replies are email-only in the dashboard inbox' }, { status: 400 })
  }
  if (!replyBody) {
    return jsonResponse({ error: 'Reply body is required' }, { status: 400 })
  }

  const contact = await getSubmissionContact(db, siteId, 'reservation', submissionId)
  if (!contact) {
    return jsonResponse({ error: 'Submission not found' }, { status: 404 })
  }

  if (!contact.email) {
    return jsonResponse({ error: 'This guest has no email on file' }, { status: 400 })
  }

  const siteRow = await queryFirst<{ brand_name: string | null }>(db, `SELECT brand_name FROM sites WHERE id = ? LIMIT 1`, [siteId])
  const fromName = siteRow?.brand_name || 'KrabiClaw'

  const result = await sendReplyEmail(env, {
    to: contact.email,
    fromName,
    subject: `Re: your reservation at ${fromName}`,
    body: replyBody,
    submissionType: 'reservation',
    submissionId,
  })

  try {
    await insertSubmissionMessage(db, {
      submissionType: 'reservation',
      submissionId,
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
    console.error('Failed to save reply message to database', error)
    // Don't override a successful send with a DB insert failure
  }

  if (!result.success) {
    return jsonResponse({ error: result.error || 'Failed to send reply' }, { status: 502 })
  }

  return jsonResponse({ sent: true })
})
