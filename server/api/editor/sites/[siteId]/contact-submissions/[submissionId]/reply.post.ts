// POST /api/editor/sites/[siteId]/contact-submissions/[submissionId]/reply
// Owner/admin sends a reply to the person who submitted the contact form, over email
// (contact submissions have no phone number on file, so WhatsApp isn't offered here).
import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertOrganizationAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'
import { getSubmissionContact, insertSubmissionMessage, sendReplyEmail } from '~/server/utils/submission-messages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { env, db, session, site } = await requireSiteAccess(event, siteId, 'context')
  assertOrganizationAccess(site.member_role)

  const body = await readBody(event) as { channel?: unknown; body?: unknown }
  const channel = body.channel
  const replyBody = typeof body.body === 'string' ? body.body.trim() : ''
  if (channel !== 'email') {
    return jsonResponse({ error: 'Contact submissions can only be replied to over email' }, { status: 400 })
  }
  if (!replyBody) {
    return jsonResponse({ error: 'Reply body is required' }, { status: 400 })
  }

  const contact = await getSubmissionContact(db, siteId, 'contact', submissionId)
  if (!contact || !contact.email) {
    return jsonResponse({ error: 'Submission not found' }, { status: 404 })
  }

  const siteRow = await queryFirst<{ brand_name: string | null }>(db, `SELECT brand_name FROM sites WHERE id = ? LIMIT 1`, [siteId])
  const fromName = siteRow?.brand_name || 'KrabiClaw'

  const result = await sendReplyEmail(env, {
    to: contact.email,
    fromName,
    subject: `Re: your message to ${fromName}`,
    body: replyBody,
    submissionType: 'contact',
    submissionId,
  })

  try {
    await insertSubmissionMessage(db, {
      submissionType: 'contact',
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
    // Don't override successful email send with DB insert failure
  }

  if (!result.success) {
    return jsonResponse({ error: result.error || 'Failed to send reply' }, { status: 502 })
  }

  return jsonResponse({ sent: true })
})
