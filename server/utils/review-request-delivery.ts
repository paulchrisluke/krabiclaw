import type { DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
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

function platformDomain(env: ReviewRequestDeliveryEnv): string {
  const configured = env.NUXT_PUBLIC_PLATFORM_DOMAIN?.trim()
  if (!configured) throw new Error('NUXT_PUBLIC_PLATFORM_DOMAIN is required')
  return configured.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function siteBaseUrl(env: ReviewRequestDeliveryEnv, context: ReviewBookingContext): string {
  const publicUrl = context.site_public_url?.replace(/\/$/, '')
  if (publicUrl) return publicUrl
  const subdomain = context.site_subdomain?.trim()
  if (subdomain) return `https://${subdomain}.${platformDomain(env)}`
  throw new Error('Site public URL or subdomain is required')
}

function bookingLabel(context: ReviewBookingContext): string {
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
  const baseUrl = siteBaseUrl(env, context)
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
      bookingLabel: bookingLabel(context),
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
