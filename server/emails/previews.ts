import type { Component } from 'vue'
import AuthResetPassword from './templates/AuthResetPassword'
import AuthVerifyEmail from './templates/AuthVerifyEmail'
import BookingChangeProposal from './templates/BookingChangeProposal'
import BookingGuestCancelled from './templates/BookingGuestCancelled'
import BookingGuestReceived from './templates/BookingGuestReceived'
import BookingReviewReminder from './templates/BookingReviewReminder'
import BookingThankYouReviewRequest from './templates/BookingThankYouReviewRequest'
import ContactGuestReceived from './templates/ContactGuestReceived'
import GuestThreadReply from './templates/GuestThreadReply'
import GuestThreadStatusUpdate from './templates/GuestThreadStatusUpdate'
import OrganizationInvite from './templates/OrganizationInvite'
import PlatformArticleAnnouncement from './templates/PlatformArticleAnnouncement'
import ReservationGuestCancelled from './templates/ReservationGuestCancelled'
import ReservationGuestReceived from './templates/ReservationGuestReceived'

/**
 * The component-rendered emails, with sample data, for /dev/notifications.
 *
 * Owner alerts are not here: they are NotificationMessages now, previewed from
 * PARITY_CASES so the page shows the same object the parity guard checks.
 *
 * This is the single list the preview renders from, and
 * scripts/check-email-previews.mjs fails the build if a template in
 * server/emails/templates has no entry here — a preview that silently covered
 * 14 of 23 templates could not answer "what do our emails look like", which is
 * the only question it exists to answer.
 */
export interface EmailPreviewDefinition {
  id: string
  audience: 'owner' | 'guest'
  /** The notification template name this copy belongs to, for the logs view. */
  template: string
  title: string
  subject: string
  component: Component
  props: Record<string, unknown>
}

const platformDomain = 'krabiclaw.com'
const restaurant = 'Ember & Slice'
const studio = 'Pottery House Krabi'

export const EMAIL_PREVIEWS: EmailPreviewDefinition[] = [
  {
    id: 'auth-verify-email',
    audience: 'guest',
    template: 'auth_verify_email',
    title: 'Sign-up — verify your email',
    subject: 'Verify your KrabiClaw email',
    component: AuthVerifyEmail,
    props: { verificationUrl: 'https://krabiclaw.com/api/auth/verify-email?token=preview', platformDomain },
  },
  {
    id: 'auth-reset-password',
    audience: 'guest',
    template: 'auth_reset_password',
    title: 'Sign-in — reset your password',
    subject: 'Reset your KrabiClaw password',
    component: AuthResetPassword,
    props: { resetUrl: 'https://krabiclaw.com/reset-password?token=preview', platformDomain },
  },
  {
    id: 'organization-invite-email',
    audience: 'guest',
    template: 'organization_invited',
    title: 'Invitee — organization invitation',
    subject: `You're invited to join ${studio} on KrabiClaw`,
    component: OrganizationInvite,
    props: { organizationName: studio, inviterName: 'Priya Shah', role: 'admin', inviteUrl: 'https://demo.krabiclaw.com/accept-invitation/invite-preview-1', platformDomain },
  },
  {
    id: 'guest-reservation-received-email',
    audience: 'guest',
    template: 'reservation_customer_received',
    title: 'Guest — reservation confirmed',
    subject: 'Your reservation is confirmed',
    component: ReservationGuestReceived,
    props: { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', contactPhone: '+1 555 000 0000', contactEmail: 'hello@emberslice.example', cancelUrl: 'https://demo.krabiclaw.com/reservations/cancel?id=res-preview-1', platformDomain },
  },
  {
    id: 'guest-reservation-cancelled-email',
    audience: 'guest',
    template: 'reservation_customer_cancelled',
    title: 'Guest — reservation cancelled',
    subject: 'Your reservation request was cancelled',
    component: ReservationGuestCancelled,
    props: { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', locationName: 'Main Dining Room', specialRequests: 'Window seat', wasConfirmed: false, platformDomain },
  },
  {
    id: 'guest-experience-booking-received-email',
    audience: 'guest',
    template: 'booking_customer_received',
    title: 'Guest — experience booking sent',
    subject: 'Your booking request was sent — Pottery Wheel Class',
    component: BookingGuestReceived,
    props: { guestName: 'Mina Park', siteName: studio, productTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM', partySize: 2, contactPhone: '+66 76 000 0001', contactEmail: 'hello@example.com', cancelUrl: 'https://demo.krabiclaw.com/bookings/cancel?id=booking-preview-1', platformDomain },
  },
  {
    id: 'guest-experience-booking-cancelled-email',
    audience: 'guest',
    template: 'booking_customer_cancelled',
    title: 'Guest — experience booking cancelled',
    subject: 'Your booking was cancelled',
    component: BookingGuestCancelled,
    props: { guestName: 'Mina Park', siteName: studio, productTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM', partySize: 2, notes: null, wasConfirmed: true, platformDomain },
  },
  {
    id: 'guest-booking-change-proposal-email',
    audience: 'guest',
    template: 'booking.change_requested',
    title: 'Guest — booking change proposed',
    subject: 'Please review changes to your booking',
    component: BookingChangeProposal,
    props: { guestName: 'Mina Park', siteName: studio, heading: 'Please review changes to your booking', intro: 'Hi Mina, your host has requested changes to your booking. It stays exactly as it is until you accept, and the link below expires in 7 days.', rows: [['Location', 'Main Studio'], ['When', 'Tue, Jul 21, 2026 at 2:00 PM'], ['Guests', '2']], actionUrl: 'https://demo.krabiclaw.com/booking-changes/booking-preview-1/entry-preview-1', actionText: 'Review the changes', platformDomain },
  },
  {
    id: 'guest-contact-received-email',
    audience: 'guest',
    template: 'contact_customer_received',
    title: 'Guest — message sent',
    subject: 'Your message was sent',
    component: ContactGuestReceived,
    props: { guestName: 'Jordan Lee', siteName: restaurant, subject: 'general', message: 'Hi, do you have vegan options and parking nearby?', platformDomain, consentAcknowledged: true },
  },
  {
    id: 'guest-thread-reply-email',
    audience: 'guest',
    template: 'guest_thread_member_reply',
    title: 'Guest — a reply from the business',
    subject: `Re: your message to ${restaurant}`,
    component: GuestThreadReply,
    props: { siteName: restaurant, body: 'Hi Jordan,\n\nYes — we have a full vegan menu, and there is street parking on Soi 3 right outside. See you Tuesday!', platformDomain },
  },
  {
    id: 'guest-thread-status-update-email',
    audience: 'guest',
    template: 'guest_thread_status_update',
    title: 'Guest — reservation status changed',
    subject: `Your reservation at ${restaurant} is confirmed`,
    component: GuestThreadStatusUpdate,
    props: { siteName: restaurant, heading: `Your reservation at ${restaurant} is confirmed`, body: 'Your reservation is confirmed: Tue, Jul 14, 2026 at 7:00 PM for 2 guests.', actionUrl: 'https://demo.krabiclaw.com/reservations/cancel?id=res-preview-1', actionText: 'Manage your reservation', platformDomain },
  },
  {
    id: 'guest-review-request-email',
    audience: 'guest',
    template: 'booking_thank_you_review_request',
    title: 'Guest — review request after a visit',
    subject: `Thanks for visiting ${restaurant}`,
    component: BookingThankYouReviewRequest,
    props: { guestName: 'Alex Carter', siteName: restaurant, locationName: 'Main Dining Room', bookingPhrase: 'your table at Ember & Slice', visitAt: 'Tue, Jul 14, 2026 at 7:00 PM', partySize: '2 guests', reviewUrl: 'https://demo.krabiclaw.com/locations/main/review-submit?request=preview', optOutUrl: 'https://demo.krabiclaw.com/locations/main/review-submit?request=preview&optOut=1', platformDomain },
  },
  {
    id: 'guest-review-reminder-email',
    audience: 'guest',
    template: 'booking_review_reminder',
    title: 'Guest — review reminder',
    subject: `How was your visit to ${restaurant}?`,
    component: BookingReviewReminder,
    props: { guestName: 'Alex Carter', siteName: restaurant, locationName: 'Main Dining Room', visitAt: 'Tue, Jul 14, 2026 at 7:00 PM', partySize: '2 guests', reviewUrl: 'https://demo.krabiclaw.com/locations/main/review-submit?request=preview', optOutUrl: 'https://demo.krabiclaw.com/locations/main/review-submit?request=preview&optOut=1', platformDomain },
  },
  {
    id: 'owner-article-announcement-email',
    audience: 'owner',
    template: 'platform_article_announcement',
    title: 'KrabiClaw news — new article published',
    subject: 'Turning walk-ins into repeat guests',
    component: PlatformArticleAnnouncement,
    props: { title: 'Turning walk-ins into repeat guests', summary: 'Three things the best-performing KrabiClaw sites do after a guest leaves.', coverImageUrl: null, articleUrl: 'https://krabiclaw.com/blog/operations/turning-walk-ins-into-repeat-guests', unsubscribeUrl: 'https://krabiclaw.com/unsubscribe?user=preview&category=product_news&token=preview', platformDomain },
  },
]
