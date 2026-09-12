import type { DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { formatTimestamp } from '~/utils/timezone'
import { notifyReviewRequest } from '~/server/utils/notifications'
import {
  createOrRotateReviewRequest,
  getReviewBookingContext,
  markReviewRequestSendFailure,
  markReviewRequestSendSuccess,
  type ReviewBookingContext,
  type ReviewBookingType,
} from '~/server/utils/review-requests'

type ReviewRequestDeliveryEnv = CloudflareEnv

function siteBaseUrl(context: ReviewBookingContext): string {
  const publicUrl = context.site_public_url?.replace(/\/$/, '')
  if (!publicUrl) throw new Error('Site has no active canonical domain')
  return publicUrl
}

// Headline copy only: "How was your reservation?". This is a sentence fragment,
// not a value — the detail rows carry the visit itself.
function bookingPhrase(context: ReviewBookingContext): string {
  return context.booking_type === 'reservation' ? 'your reservation' : 'your experience booking'
}

export async function sendReviewRequestForBooking(
  env: ReviewRequestDeliveryEnv,
  db: DbClient,
  bookingType: ReviewBookingType,
  bookingId: string,
  kind: 'first' | 'reminder' = 'first',
): Promise<{ sent: boolean; requestId: string; error?: string }> {
  const context = await getReviewBookingContext(db, bookingType, bookingId)
  if (!context) throw new Error('Booking not found')
  if (!context.location_slug) throw new Error('Booking location is missing a public slug')
  if (kind === 'first' && context.review_request_sent_at) throw new Error('Review request has already been sent')
  if (kind === 'reminder' && !context.review_request_sent_at) throw new Error('Cannot send reminder before first request')
  if (kind === 'reminder' && context.review_reminder_sent_at) throw new Error('Review reminder has already been sent')
  const recipientEmail = context.customer_email || context.guest_email || ''
  if (!recipientEmail) throw new Error('Booking customer has no email address')

  const { request, token } = await createOrRotateReviewRequest(db, context)
  const baseUrl = siteBaseUrl(context)
  const reviewUrl = `${baseUrl}/locations/${encodeURIComponent(context.location_slug)}/review-submit?token=${encodeURIComponent(token)}`
  const optOutUrl = `${reviewUrl}&optOut=1`

  try {
    const sent = await notifyReviewRequest(env, db, {
      organizationId: context.organization_id,
      siteId: context.site_id,
      siteName: context.site_name,
      locationId: context.location_id,
      requestId: request.id,
      bookingType,
      bookingId,
      kind,
      guestName: context.customer_name || context.guest_name || 'there',
      email: recipientEmail,
      locationName: context.location_title,
      bookingPhrase: bookingPhrase(context),
      visitAt: formatTimestamp(context.visit_starts_at, 'en', context.visit_timezone),
      partySize: context.party_size === 1 ? '1 guest' : `${context.party_size} guests`,
      reviewUrl,
      optOutUrl,
    })
    if (!sent) {
      await markReviewRequestSendFailure(db, request.id, new Error('Email delivery failed'))
      return { sent: false, requestId: request.id, error: 'Email delivery failed' }
    }

    await markReviewRequestSendSuccess(db, request.id, kind)
    return { sent: true, requestId: request.id }
  } catch (error) {
    await markReviewRequestSendFailure(db, request.id, error)
    return {
      sent: false,
      requestId: request.id,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
