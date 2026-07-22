// POST /api/editor/sites/[siteId]/experience-bookings/[bookingId]/reply
// An authorized site/location manager sends an email reply to the guest.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { assertResourceAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'
import { getSubmissionContact, insertSubmissionMessage, sendReplyEmail } from '~/server/utils/submission-messages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const bookingId = getRouterParam(event, 'bookingId')
  if (!siteId || !bookingId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const booking = await queryFirst<{ id: string; location_id: string; organization_id: string; member_id: string; member_role: string }>(db, `
    SELECT eb.id, eb.location_id, s.organization_id, m.id AS member_id, m.role AS member_role
    FROM experience_bookings eb
    JOIN sites s ON s.id = eb.site_id
    JOIN member m ON m.organizationId = s.organization_id
    WHERE eb.id = ? AND eb.site_id = ? AND m.userId = ?
    LIMIT 1
  `, [bookingId, siteId, session.user.id])
  if (!booking) return jsonResponse({ error: 'Booking not found or access denied' }, { status: 404 })

  await assertResourceAccess(db, {
    memberId: booking.member_id,
    role: booking.member_role,
    organizationId: booking.organization_id,
    siteId,
    resourceLocationId: booking.location_id,
  })

  const body = await readBody(event) as { channel?: unknown; body?: unknown }
  const channel = body.channel
  const replyBody = typeof body.body === 'string' ? body.body.trim() : ''
  if (channel !== 'email') {
    return jsonResponse({ error: 'Experience booking replies are email-only in the dashboard inbox' }, { status: 400 })
  }
  if (!replyBody) {
    return jsonResponse({ error: 'Reply body is required' }, { status: 400 })
  }

  const contact = await getSubmissionContact(db, siteId, 'experience_booking', bookingId)
  if (!contact) {
    return jsonResponse({ error: 'Booking not found' }, { status: 404 })
  }

  if (!contact.email) {
    return jsonResponse({ error: 'This guest has no email on file' }, { status: 400 })
  }

  const siteRow = await queryFirst<{ brand_name: string | null }>(db, `SELECT brand_name FROM sites WHERE id = ? LIMIT 1`, [siteId])
  const fromName = siteRow?.brand_name || 'KrabiClaw'

  const result = await sendReplyEmail(env, {
    to: contact.email,
    fromName,
    subject: `Re: your booking at ${fromName}`,
    body: replyBody,
    submissionType: 'experience_booking',
    submissionId: bookingId,
  })

  await insertSubmissionMessage(db, {
    submissionType: 'experience_booking',
    submissionId: bookingId,
    organizationId: booking.organization_id,
    siteId,
    direction: 'out',
    channel: 'email',
    body: replyBody,
    senderUserId: session.user.id,
    metaMessageId: result.messageId ?? null,
    status: result.success ? 'sent' : 'failed',
    error: result.error ?? null,
  })

  if (!result.success) {
    return jsonResponse({ error: result.error || 'Failed to send reply' }, { status: 502 })
  }

  return jsonResponse({ sent: true })
})
