import type { WhatsAppTemplate } from '~/server/utils/whatsapp'
import type { NotificationMessage } from './messages'
import {
  bookingCancelledMessage,
  bookingChangeMessage,
  bookingCreatedMessage,
  contactReceivedMessage,
  domainUpdateMessage,
  guestReplyMessage,
  reservationCancelledMessage,
  reservationCreatedMessage,
  reviewReceivedMessage,
} from './events'
import {
  articleAnnouncementMessage,
  bookingChangeProposalMessage,
  guestBookingCancelledMessage,
  guestBookingReceivedMessage,
  guestContactReceivedMessage,
  guestReservationCancelledMessage,
  guestReservationReceivedMessage,
  guestThreadReplyMessage,
  guestThreadStatusMessage,
  organizationInviteMessage,
  resetPasswordMessage,
  reviewRequestMessage,
  verifyEmailMessage,
} from './guest-events'

/**
 * Every message the product sends, with sample data.
 *
 * One list, because the preview and the guards must be looking at the same
 * thing — a preview showing something no check covers is worth nothing, and a
 * check covering something nobody can see does not help anyone write copy.
 *
 * `whatsappTemplate` marks the events that also send over WhatsApp; those are
 * the ones lint:notification-parity holds to the rule that every lead fact
 * reaches both channels.
 */
export interface CatalogEntry {
  id: string
  audience: 'owner' | 'guest'
  title: string
  message: NotificationMessage
  whatsappTemplate?: WhatsAppTemplate
}

const restaurant = 'Ember & Slice'
const studio = 'Pottery House Krabi'
const inbox = 'https://demo.krabiclaw.com/dashboard/ember-slice/messages/preview-1'

const reservation = {
  guestName: 'Alex Carter',
  guestEmail: 'alex@example.com',
  guestPhone: '+1 555 123 4567',
  date: 'Tue, Jul 14, 2026',
  time: '7:00 PM',
  partySize: '2 guests',
  locationName: 'Main Dining Room',
  siteName: restaurant,
  notes: 'Window seat, celebrating an anniversary.',
  heroImageUrl: null,
  replyUrl: inbox,
}

// A real tenant asset, so the preview shows what a hero actually looks like
// rather than a message that happens to have none.
const sampleCover = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/245066b6-926f-4dbb-e731-53ebb0e22700/public'

const booking = {
  ...reservation,
  heroImageUrl: sampleCover,
  guestName: 'Mina Park',
  guestEmail: 'mina@example.com',
  guestPhone: '+66 76 000 0002',
  siteName: studio,
  productTitle: 'Pottery Wheel Class',
  date: 'Mon, Jul 20, 2026',
  time: '10:00 AM',
  locationName: 'Main Studio',
  notes: null,
}

const guestVisit = {
  guestName: 'Alex Carter',
  siteName: restaurant,
  date: 'Tue, Jul 14, 2026',
  time: '7:00 PM',
  partySize: '2 guests',
  locationName: 'Main Dining Room',
  notes: 'Window seat.',
  contactPhone: '+1 555 000 0000',
  contactEmail: 'hello@emberslice.example',
  cancelUrl: 'https://demo.krabiclaw.com/reservations/cancel?id=preview',
  heroImageUrl: sampleCover,
}

export const NOTIFICATION_CATALOG: CatalogEntry[] = [
  // Owner alerts — both channels.
  { id: 'reservation-created', audience: 'owner', title: 'Owner — new reservation', whatsappTemplate: 'new_reservation', message: reservationCreatedMessage(reservation) },
  { id: 'reservation-cancelled', audience: 'owner', title: 'Owner — reservation cancelled', whatsappTemplate: 'reservation_cancelled', message: reservationCancelledMessage({ ...reservation, wasConfirmed: true }) },
  { id: 'booking-created', audience: 'owner', title: 'Owner — new experience booking', whatsappTemplate: 'new_reservation', message: bookingCreatedMessage(booking) },
  { id: 'booking-cancelled', audience: 'owner', title: 'Owner — booking cancelled', whatsappTemplate: 'reservation_cancelled', message: bookingCancelledMessage({ ...booking, wasConfirmed: false }) },
  {
    id: 'contact-received',
    audience: 'owner',
    title: 'Owner — new contact message',
    whatsappTemplate: 'new_contact_msg',
    message: contactReceivedMessage({
      guestName: 'Jordan Lee', guestEmail: 'jordan@example.com', subject: 'General',
      message: 'Hi, do you have vegan options and parking nearby?',
      productTitle: 'Pottery Wheel Class', siteName: restaurant, consentAcknowledged: true, replyUrl: inbox,
    }),
  },
  {
    id: 'guest-reply',
    audience: 'owner',
    title: 'Owner — guest replied',
    whatsappTemplate: 'guest_thread_reply_whatsapp',
    message: guestReplyMessage({
      guestName: 'Jordan Lee', guestEmail: 'jordan@example.com', inboundChannel: 'email',
      messagePreview: 'Thanks! One more thing — is the terrace covered if it rains?',
      siteName: restaurant, replyUrl: inbox,
    }),
  },
  {
    id: 'review-received',
    audience: 'owner',
    title: 'Owner — new review',
    whatsappTemplate: 'new_review',
    message: reviewReceivedMessage({
      authorName: 'Alex Carter', rating: 5,
      content: 'The wood-fired pizza was outstanding and the team could not have been kinder.',
      siteName: restaurant, reviewsUrl: 'https://demo.krabiclaw.com/dashboard/ember-slice/reviews',
    }),
  },
  {
    id: 'booking-change',
    audience: 'owner',
    title: 'Owner — booking change decided',
    whatsappTemplate: 'booking_change_update',
    message: bookingChangeMessage({
      recordKind: 'booking', guestName: 'Mina Park', status: 'accepted', location: 'Main Studio',
      date: 'Jul 21, 2026', time: '2:00 PM', whenLabel: 'Tue, Jul 21, 2026 at 2:00 PM',
      partySize: '2 guests', summary: 'The guest accepted. The updated details are now confirmed.',
      replyUrl: inbox, siteName: studio,
    }),
  },
  {
    id: 'domain-update',
    audience: 'owner',
    title: 'Owner — custom domain updated',
    whatsappTemplate: 'domain_update',
    message: domainUpdateMessage({
      headline: 'emberslice.com is live', message: 'Your custom domain is verified and serving traffic.',
      domain: 'emberslice.com', status: 'active',
      dashboardUrl: 'https://demo.krabiclaw.com/dashboard/ember-slice/settings/website/domains',
    }),
  },

  // Guest and account mail — email only.
  { id: 'auth-verify', audience: 'guest', title: 'Sign-up — verify your email', message: verifyEmailMessage({ verificationUrl: 'https://krabiclaw.com/api/auth/verify-email?token=preview' }) },
  { id: 'auth-reset', audience: 'guest', title: 'Sign-in — reset your password', message: resetPasswordMessage({ resetUrl: 'https://krabiclaw.com/reset-password?token=preview' }) },
  { id: 'organization-invite', audience: 'guest', title: 'Invitee — organization invitation', message: organizationInviteMessage({ organizationName: studio, inviterName: 'Priya Shah', role: 'Admin', inviteUrl: 'https://demo.krabiclaw.com/accept-invitation/preview' }) },
  { id: 'guest-reservation-received', audience: 'guest', title: 'Guest — reservation confirmed', message: guestReservationReceivedMessage(guestVisit) },
  { id: 'guest-reservation-cancelled', audience: 'guest', title: 'Guest — reservation cancelled', message: guestReservationCancelledMessage({ ...guestVisit, wasConfirmed: true }) },
  { id: 'guest-booking-received', audience: 'guest', title: 'Guest — booking request sent', message: guestBookingReceivedMessage({ ...guestVisit, guestName: 'Mina Park', siteName: studio, productTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM' }) },
  { id: 'guest-booking-cancelled', audience: 'guest', title: 'Guest — booking cancelled', message: guestBookingCancelledMessage({ ...guestVisit, guestName: 'Mina Park', siteName: studio, productTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM', wasConfirmed: false }) },
  { id: 'guest-contact-received', audience: 'guest', title: 'Guest — message sent', message: guestContactReceivedMessage({ guestName: 'Jordan Lee', siteName: restaurant, subject: 'General', productTitle: 'Pottery Wheel Class', message: 'Hi, do you have vegan options and parking nearby?', consentAcknowledged: true }) },
  { id: 'guest-thread-reply', audience: 'guest', title: 'Guest — a reply from the business', message: guestThreadReplyMessage({ siteName: restaurant, body: 'Hi Jordan,\n\nYes — we have a full vegan menu, and there is street parking on Soi 3 right outside. See you Tuesday!' }) },
  { id: 'guest-thread-status', audience: 'guest', title: 'Guest — reservation status changed', message: guestThreadStatusMessage({ siteName: restaurant, heading: `Your reservation at ${restaurant} is confirmed`, body: 'Your reservation is confirmed: Tue, Jul 14, 2026 at 7:00 PM for 2 guests.', actionUrl: guestVisit.cancelUrl, actionLabel: 'Manage your reservation' }) },
  { id: 'guest-booking-change-proposal', audience: 'guest', title: 'Guest — booking change proposed', message: bookingChangeProposalMessage({ guestName: 'Mina Park', siteName: studio, heading: 'Please review changes to your booking', intro: 'Your host has requested changes. Your booking stays exactly as it is until you accept, and the link below expires in 7 days.', rows: [['Location', 'Main Studio'], ['When', 'Tue, Jul 21, 2026 at 2:00 PM'], ['Guests', '2']], actionUrl: 'https://demo.krabiclaw.com/booking-changes/preview', actionLabel: 'Review the changes' }) },
  { id: 'guest-review-request', audience: 'guest', title: 'Guest — review request', message: reviewRequestMessage({ guestName: 'Alex Carter', siteName: restaurant, locationName: 'Main Dining Room', visitAt: 'Tue, Jul 14, 2026 at 7:00 PM', partySize: '2 guests', reviewUrl: 'https://demo.krabiclaw.com/locations/main/review-submit?request=preview', optOutUrl: 'https://demo.krabiclaw.com/locations/main/review-submit?request=preview&optOut=1', reminder: false }) },
  { id: 'guest-review-reminder', audience: 'guest', title: 'Guest — review reminder', message: reviewRequestMessage({ guestName: 'Alex Carter', siteName: restaurant, locationName: 'Main Dining Room', visitAt: 'Tue, Jul 14, 2026 at 7:00 PM', partySize: '2 guests', reviewUrl: 'https://demo.krabiclaw.com/locations/main/review-submit?request=preview', optOutUrl: 'https://demo.krabiclaw.com/locations/main/review-submit?request=preview&optOut=1', reminder: true }) },
  { id: 'article-announcement', audience: 'owner', title: 'KrabiClaw news — new article', message: articleAnnouncementMessage({ title: 'Turning walk-ins into repeat guests', summary: 'Three things the best-performing KrabiClaw sites do after a guest leaves.', coverImageUrl: null, articleUrl: 'https://krabiclaw.com/blog/operations/preview' }) },
]
