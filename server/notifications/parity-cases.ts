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

/**
 * One realistic message per dual-channel event, for the parity guard and for
 * the /dev/notifications preview.
 *
 * Sample data lives beside the builders rather than inside the guard so the
 * preview and the check are looking at the same thing — a preview that showed
 * something the guard did not check would be worth nothing.
 */
export interface ParityCase {
  id: string
  template: WhatsAppTemplate
  message: NotificationMessage
}

const restaurant = 'Ember & Slice'
const studio = 'Pottery House Krabi'
const inbox = 'https://demo.krabiclaw.com/dashboard/ember-slice/sites/ember-slice/inbox/preview-1'

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

const booking = {
  ...reservation,
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

export const PARITY_CASES: ParityCase[] = [
  { id: 'reservation-created', template: 'new_reservation', message: reservationCreatedMessage(reservation) },
  { id: 'reservation-cancelled', template: 'reservation_cancelled', message: reservationCancelledMessage({ ...reservation, wasConfirmed: true }) },
  { id: 'booking-created', template: 'new_reservation', message: bookingCreatedMessage(booking) },
  { id: 'booking-cancelled', template: 'reservation_cancelled', message: bookingCancelledMessage({ ...booking, wasConfirmed: false }) },
  {
    id: 'contact-received',
    template: 'new_contact_msg',
    message: contactReceivedMessage({
      guestName: 'Jordan Lee',
      guestEmail: 'jordan@example.com',
      subject: 'General',
      message: 'Hi, do you have vegan options and parking nearby?',
      productTitle: 'Pottery Wheel Class',
      siteName: restaurant,
      consentAcknowledged: true,
      replyUrl: inbox,
    }),
  },
  {
    id: 'guest-reply',
    template: 'guest_thread_reply_whatsapp',
    message: guestReplyMessage({
      guestName: 'Jordan Lee',
      guestEmail: 'jordan@example.com',
      inboundChannel: 'email',
      messagePreview: 'Thanks! One more thing — is the terrace covered if it rains?',
      siteName: restaurant,
      replyUrl: inbox,
    }),
  },
  {
    id: 'review-received',
    template: 'new_review',
    message: reviewReceivedMessage({
      authorName: 'Alex Carter',
      rating: 5,
      content: 'The wood-fired pizza was outstanding and the team could not have been kinder.',
      siteName: restaurant,
      reviewsUrl: 'https://demo.krabiclaw.com/dashboard/ember-slice/sites/ember-slice/reviews',
    }),
  },
  {
    id: 'booking-change',
    template: 'booking_change_update',
    message: bookingChangeMessage({
      recordKind: 'booking',
      guestName: 'Mina Park',
      status: 'accepted',
      location: 'Main Studio',
      date: 'Jul 21, 2026',
      time: '2:00 PM',
      whenLabel: 'Tue, Jul 21, 2026 at 2:00 PM',
      partySize: '2 guests',
      summary: 'Your changes are confirmed.',
      replyUrl: inbox,
      siteName: studio,
    }),
  },
  {
    id: 'domain-update',
    template: 'domain_update',
    message: domainUpdateMessage({
      headline: 'emberslice.com is live',
      message: 'Your custom domain is verified and serving traffic.',
      domain: 'emberslice.com',
      status: 'active',
      dashboardUrl: 'https://demo.krabiclaw.com/dashboard/ember-slice/sites/ember-slice/settings/domains',
    }),
  },
]
