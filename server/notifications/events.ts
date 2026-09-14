import type { NotificationFact, NotificationMessage } from './messages'

/**
 * The owner-facing events that send on both channels, each described once.
 *
 * Facts are ordered by importance: the WhatsApp mapping reads them by key and
 * the approved templates have fixed slots, so what matters is placed high here
 * rather than remembered separately at a send site.
 *
 * `date` and `time` are separate facts rather than one "when" string because
 * the approved templates have a slot for each — and because showing them as two
 * cells is how a reservation reads at a glance.
 */

function fact(key: string, label: string, value: string | null | undefined, lead = false): NotificationFact | null {
  const text = (value ?? '').toString().trim()
  return text ? { key, label, value: text, lead } : null
}

function facts(...entries: Array<NotificationFact | null>): NotificationFact[] {
  return entries.filter((entry): entry is NotificationFact => entry !== null)
}

export interface ReservationEventInput {
  guestName: string
  guestEmail: string
  guestPhone: string | null
  date: string
  time: string
  partySize: string
  locationName: string | null
  siteName: string
  notes: string | null
  heroImageUrl: string | null
  replyUrl: string | null
}

export function reservationCreatedMessage(input: ReservationEventInput): NotificationMessage {
  return {
    title: `New confirmed reservation from ${input.guestName}`,
    preheader: `${input.date} at ${input.time} · ${input.partySize}`,
    hero: input.heroImageUrl ? { imageUrl: input.heroImageUrl, alt: '' } : null,
    facts: facts(
      fact('guestName', 'Guest', input.guestName, true),
      fact('date', 'Date', input.date, true),
      fact('time', 'Time', input.time, true),
      fact('partySize', 'Party size', input.partySize, true),
      fact('context', 'Location', input.locationName ?? 'Location not provided'),
      fact('guestPhone', 'Phone', input.guestPhone),
      fact('guestEmail', 'Email', input.guestEmail),
      fact('notes', 'Special requests', input.notes),
    ),
    primaryAction: input.replyUrl ? { url: input.replyUrl, label: 'Reply in dashboard' } : undefined,
    category: 'reservations_bookings',
    siteName: input.siteName,
  }
}

export function reservationCancelledMessage(input: ReservationEventInput & { wasConfirmed: boolean }): NotificationMessage {
  // Whether it was confirmed decides how urgently an owner acts, and the
  // approved template has no slot of its own for it — so it leads the venue
  // fact, which WhatsApp does carry, instead of living only in the subject.
  const standing = input.wasConfirmed ? 'Confirmed reservation' : 'Reservation request'
  const venue = [standing, input.locationName].filter(Boolean).join(' · ')
  return {
    title: `${standing} cancelled by ${input.guestName}`,
    preheader: `${input.date} at ${input.time} · ${input.partySize}`,
    hero: input.heroImageUrl ? { imageUrl: input.heroImageUrl, alt: '' } : null,
    facts: facts(
      fact('guestName', 'Guest', input.guestName, true),
      fact('context', 'What was cancelled', venue, true),
      fact('date', 'Date', input.date, true),
      fact('time', 'Time', input.time, true),
      fact('partySize', 'Party size', input.partySize, true),
      fact('guestPhone', 'Phone', input.guestPhone),
      fact('guestEmail', 'Email', input.guestEmail),
      fact('notes', 'Special requests', input.notes),
    ),
    primaryAction: input.replyUrl ? { url: input.replyUrl, label: 'Open in dashboard' } : undefined,
    category: 'reservations_bookings',
    siteName: input.siteName,
  }
}

export interface BookingEventInput extends ReservationEventInput {
  productTitle: string
}

export function bookingCreatedMessage(input: BookingEventInput): NotificationMessage {
  return {
    title: `New booking request from ${input.guestName}`,
    preheader: `${input.productTitle} · ${input.date} at ${input.time}`,
    hero: input.heroImageUrl ? { imageUrl: input.heroImageUrl, alt: input.productTitle } : null,
    facts: facts(
      fact('context', 'Experience', input.productTitle, true),
      fact('guestName', 'Guest', input.guestName, true),
      fact('date', 'Date', input.date, true),
      fact('time', 'Time', input.time, true),
      fact('partySize', 'Party size', input.partySize, true),
      fact('guestPhone', 'Phone', input.guestPhone),
      fact('guestEmail', 'Email', input.guestEmail),
      fact('notes', 'Special requests', input.notes),
    ),
    primaryAction: input.replyUrl ? { url: input.replyUrl, label: 'Reply in dashboard' } : undefined,
    category: 'reservations_bookings',
    siteName: input.siteName,
  }
}

export function bookingCancelledMessage(input: BookingEventInput & { wasConfirmed: boolean }): NotificationMessage {
  const standing = input.wasConfirmed ? 'Confirmed booking' : 'Booking request'
  return {
    title: `${standing} cancelled by ${input.guestName}`,
    preheader: `${input.productTitle} · ${input.date} at ${input.time}`,
    hero: input.heroImageUrl ? { imageUrl: input.heroImageUrl, alt: input.productTitle } : null,
    facts: facts(
      fact('context', 'What was cancelled', `${standing} · ${input.productTitle}`, true),
      fact('guestName', 'Guest', input.guestName, true),
      fact('date', 'Date', input.date, true),
      fact('time', 'Time', input.time, true),
      fact('partySize', 'Party size', input.partySize, true),
      fact('guestPhone', 'Phone', input.guestPhone),
      fact('guestEmail', 'Email', input.guestEmail),
      fact('notes', 'Special requests', input.notes),
    ),
    primaryAction: input.replyUrl ? { url: input.replyUrl, label: 'Open in dashboard' } : undefined,
    category: 'reservations_bookings',
    siteName: input.siteName,
  }
}

export interface ContactEventInput {
  guestName: string
  guestEmail: string
  subject: string
  message: string
  productTitle: string | null
  siteName: string
  consentAcknowledged: boolean
  replyUrl: string | null
}

export function contactReceivedMessage(input: ContactEventInput): NotificationMessage {
  // The product a guest is asking about is the whole point of the message, and
  // the approved template has no slot for it — so it rides in the subject,
  // which does have one, rather than staying in the email alone.
  const subject = [input.subject, input.productTitle].filter(Boolean).join(' · ')
  return {
    title: `New website message from ${input.guestName}`,
    preheader: subject,
    hero: null,
    facts: facts(
      fact('guestName', 'From', input.guestName, true),
      fact('subject', 'About', subject, true),
      fact('guestEmail', 'Email', input.guestEmail, true),
      fact('message', 'Message', input.message, true),
      input.consentAcknowledged ? fact('consent', 'Contact/privacy notice', 'Acknowledged') : null,
    ),
    primaryAction: input.replyUrl ? { url: input.replyUrl, label: 'Reply in dashboard' } : undefined,
    category: 'guest_messages',
    siteName: input.siteName,
  }
}

export interface GuestReplyEventInput {
  guestName: string
  guestEmail: string | null
  inboundChannel: 'email' | 'whatsapp'
  messagePreview: string
  siteName: string | null
  replyUrl: string | null
}

export function guestReplyMessage(input: GuestReplyEventInput): NotificationMessage {
  // The site name has no slot of its own, so it rides in the subject alongside
  // how the guest wrote in. An owner with several sites needs to know which.
  const subject = [input.inboundChannel === 'whatsapp' ? 'WhatsApp reply' : 'Email reply', input.siteName].filter(Boolean).join(' · ')
  return {
    title: `New guest reply from ${input.guestName}`,
    preheader: input.messagePreview.slice(0, 120),
    hero: null,
    facts: facts(
      fact('guestName', 'From', input.guestName, true),
      fact('subject', 'Conversation', subject, true),
      fact('guestEmail', 'Email', input.guestEmail ?? 'No email provided'),
      fact('message', 'Message', input.messagePreview, true),
    ),
    primaryAction: input.replyUrl ? { url: input.replyUrl, label: 'Open thread in dashboard' } : undefined,
    category: 'guest_messages',
    siteName: input.siteName,
  }
}

export interface ReviewEventInput {
  authorName: string
  rating: number
  content: string
  siteName: string
  reviewsUrl: string | null
}

export function reviewReceivedMessage(input: ReviewEventInput): NotificationMessage {
  // The approved template has a rating slot and an excerpt slot and no author
  // slot, so the author leads the excerpt — the email's own headline is
  // "New review from {author}", and WhatsApp used to name nobody at all.
  const excerpt = input.content.trim() ? `${input.authorName}: ${input.content.trim()}` : `${input.authorName} left a rating.`
  return {
    title: `New ${input.rating}-star review from ${input.authorName}`,
    preheader: input.content.slice(0, 120) || `${input.rating} out of 5`,
    hero: null,
    facts: facts(
      fact('rating', 'Rating', `${input.rating} / 5`, true),
      fact('review', 'Review', excerpt, true),
    ),
    primaryAction: input.reviewsUrl ? { url: input.reviewsUrl, label: 'View review' } : undefined,
    category: 'reviews',
    siteName: input.siteName,
  }
}

export interface BookingChangeEventInput {
  recordKind: string
  guestName: string
  status: 'requested' | 'accepted' | 'declined'
  location: string
  date: string | null
  time: string | null
  whenLabel: string
  partySize: string
  summary: string
  replyUrl: string | null
  siteName: string
}

export function bookingChangeMessage(input: BookingChangeEventInput): NotificationMessage {
  return {
    title: `${input.guestName} ${input.status} the ${input.recordKind} change`,
    preheader: input.summary,
    hero: null,
    intro: input.summary,
    facts: facts(
      fact('recordKind', 'Type', input.recordKind, true),
      fact('guestName', 'Guest', input.guestName, true),
      fact('status', 'Decision', input.status, true),
      fact('location', 'Location', input.location),
      fact('date', 'Date', input.date ?? input.whenLabel, true),
      fact('time', 'Time', input.time ?? ''),
      fact('partySize', 'Party size', input.partySize, true),
      fact('summary', 'Summary', input.summary),
    ),
    primaryAction: input.replyUrl ? { url: input.replyUrl, label: 'View in dashboard' } : undefined,
    category: 'reservations_bookings',
    siteName: input.siteName,
  }
}

export interface DomainEventInput {
  headline: string
  message: string
  domain: string
  status: string
  dashboardUrl: string
}

export function domainUpdateMessage(input: DomainEventInput): NotificationMessage {
  return {
    title: input.headline,
    preheader: `${input.domain} · ${input.status}`,
    hero: null,
    intro: input.message,
    facts: facts(
      fact('domain', 'Domain', input.domain, true),
      fact('status', 'Status', input.status, true),
      fact('headline', 'Update', input.headline),
    ),
    primaryAction: { url: input.dashboardUrl, label: 'Open domain settings' },
    category: 'site_and_billing',
  }
}
