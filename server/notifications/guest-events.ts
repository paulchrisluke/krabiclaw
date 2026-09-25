import type { NotificationFact, NotificationMessage } from './messages'

/**
 * Guest-facing and account mail. Email only: a guest has no account, no
 * preference and no WhatsApp number we are allowed to message unprompted.
 *
 * These carry `category: 'account_security'` where they are transactional and
 * must arrive — a booking confirmation or a password reset is not something a
 * preference switches off.
 */

function fact(key: string, label: string, value: string | null | undefined): NotificationFact | null {
  const text = (value ?? '').toString().trim()
  return text ? { key, label, value: text } : null
}

function facts(...entries: Array<NotificationFact | null>): NotificationFact[] {
  return entries.filter((entry): entry is NotificationFact => entry !== null)
}

export function verifyEmailMessage(input: { verificationUrl: string }): NotificationMessage {
  return {
    title: 'Verify your email',
    preheader: 'Confirm your address to finish setting up your KrabiClaw account.',
    hero: null,
    intro: 'Confirm your email address to finish setting up your account and keep your sign-in secure.',
    facts: [],
    primaryAction: { url: input.verificationUrl, label: 'Verify email' },
    finePrint: 'If you did not create this account, you can ignore this email.',
    category: 'account_security',
  }
}

export function resetPasswordMessage(input: { resetUrl: string }): NotificationMessage {
  return {
    title: 'Reset your password',
    preheader: 'Choose a new KrabiClaw password.',
    hero: null,
    intro: 'We received a request to reset your password. The link below is secure and single-use.',
    facts: [],
    primaryAction: { url: input.resetUrl, label: 'Choose a new password' },
    finePrint: 'If you did not request this, you can ignore this email — your password stays as it is.',
    category: 'account_security',
  }
}

export function organizationInviteMessage(input: {
  organizationName: string
  inviterName: string
  role: string
  inviteUrl: string
}): NotificationMessage {
  return {
    title: `You're invited to ${input.organizationName}`,
    preheader: `${input.inviterName} invited you to join ${input.organizationName} on KrabiClaw.`,
    hero: null,
    facts: facts(
      fact('invitedBy', 'Invited by', input.inviterName),
      fact('organization', 'Organization', input.organizationName),
      fact('role', 'Role', input.role),
    ),
    primaryAction: { url: input.inviteUrl, label: 'Accept invitation' },
    finePrint: 'Not expecting this? You can ignore it — the invitation simply expires.',
    category: 'account_security',
  }
}

export interface GuestBookingInput {
  guestName: string
  organizationName: string
  organizationLogoUrl?: string | null
  productTitle?: string | null
  date: string
  time: string
  partySize: string
  locationName?: string | null
  notes?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  cancelUrl?: string | null
  heroImageUrl?: string | null
}

function guestVisitFacts(input: GuestBookingInput): NotificationFact[] {
  return facts(
    fact('what', input.productTitle ? 'Experience' : 'Location', input.productTitle ?? input.locationName),
    fact('date', 'Date', input.date),
    fact('time', 'Time', input.time),
    fact('partySize', 'Party size', input.partySize),
    fact('notes', 'Special requests', input.notes),
  )
}

function contactSection(input: GuestBookingInput) {
  const details = [input.contactPhone, input.contactEmail].filter(Boolean).join(' · ')
  return details
    ? [{ title: `Questions for ${input.organizationName}?`, body: details }]
    : [{ title: `Questions for ${input.organizationName}?`, body: `${input.organizationName} will be in touch using the details you provided.` }]
}

export function guestReservationReceivedMessage(input: GuestBookingInput): NotificationMessage {
  return {
    title: 'Your reservation is confirmed',
    preheader: `${input.organizationName} · ${input.date} at ${input.time}`,
    hero: input.heroImageUrl ? { imageUrl: input.heroImageUrl, alt: input.organizationName } : null,
    facts: guestVisitFacts(input),
    primaryAction: input.cancelUrl ? { url: input.cancelUrl, label: 'Manage your reservation' } : undefined,
    sections: contactSection(input),
    finePrint: input.cancelUrl ? 'The link above stays valid for 30 days.' : undefined,
    category: 'account_security',
    organizationName: input.organizationName,
    organizationLogoUrl: input.organizationLogoUrl,
  }
}

export function guestReservationCancelledMessage(input: GuestBookingInput & { wasConfirmed: boolean }): NotificationMessage {
  return {
    title: input.wasConfirmed ? 'Your reservation was cancelled' : 'Your reservation request was cancelled',
    preheader: `${input.organizationName} · ${input.date} at ${input.time}`,
    hero: null,
    facts: guestVisitFacts(input),
    sections: contactSection(input),
    category: 'account_security',
    organizationName: input.organizationName,
    organizationLogoUrl: input.organizationLogoUrl,
  }
}

export function guestBookingReceivedMessage(input: GuestBookingInput & { productTitle: string }): NotificationMessage {
  return {
    title: `Your booking request was sent`,
    preheader: `${input.productTitle} · ${input.date} at ${input.time}`,
    hero: input.heroImageUrl ? { imageUrl: input.heroImageUrl, alt: input.productTitle ?? '' } : null,
    intro: `Thanks, ${input.guestName}. ${input.organizationName} will confirm availability shortly.`,
    facts: guestVisitFacts(input),
    primaryAction: input.cancelUrl ? { url: input.cancelUrl, label: 'Manage your booking' } : undefined,
    sections: contactSection(input),
    finePrint: input.cancelUrl ? 'The link above stays valid for 30 days.' : undefined,
    category: 'account_security',
    organizationName: input.organizationName,
    organizationLogoUrl: input.organizationLogoUrl,
  }
}

export function guestBookingCancelledMessage(input: GuestBookingInput & { productTitle: string; wasConfirmed: boolean }): NotificationMessage {
  return {
    title: input.wasConfirmed ? 'Your booking was cancelled' : 'Your booking request was cancelled',
    preheader: `${input.productTitle} · ${input.date} at ${input.time}`,
    hero: null,
    facts: guestVisitFacts(input),
    sections: contactSection(input),
    category: 'account_security',
    organizationName: input.organizationName,
  }
}

export function guestContactReceivedMessage(input: {
  guestName: string
  organizationName: string
  subject: string | null
  productTitle: string | null
  message: string
  consentAcknowledged: boolean
}): NotificationMessage {
  return {
    title: 'Your message was sent',
    preheader: `Your message to ${input.organizationName} was received.`,
    hero: null,
    intro: `Thanks, ${input.guestName}. ${input.organizationName} will reply using the contact details you provided.`,
    facts: facts(
      fact('subject', 'Subject', input.subject),
      fact('productTitle', 'Regarding', input.productTitle),
      input.consentAcknowledged ? fact('consent', 'Contact/privacy notice', 'Acknowledged') : null,
    ),
    sections: [{ title: 'Your message', body: input.message }],
    category: 'account_security',
    organizationName: input.organizationName,
  }
}

export function guestThreadReplyMessage(input: { organizationName: string; body: string }): NotificationMessage {
  return {
    title: `Reply from ${input.organizationName}`,
    preheader: input.body.slice(0, 120),
    hero: null,
    facts: [],
    sections: [{ title: '', body: input.body }],
    finePrint: 'Reply to this email and your message goes straight back to the same conversation.',
    category: 'account_security',
    organizationName: input.organizationName,
  }
}

export function guestThreadStatusMessage(input: {
  organizationName: string
  heading: string
  body: string
  actionUrl?: string | null
  actionLabel?: string | null
}): NotificationMessage {
  return {
    title: input.heading,
    preheader: input.body.slice(0, 120),
    hero: null,
    intro: input.body,
    facts: [],
    primaryAction: input.actionUrl && input.actionLabel ? { url: input.actionUrl, label: input.actionLabel } : undefined,
    category: 'account_security',
    organizationName: input.organizationName,
  }
}

export function bookingChangeProposalMessage(input: {
  guestName: string
  organizationName: string
  heading: string
  intro: string
  rows: Array<[string, string]>
  actionUrl?: string | null
  actionLabel?: string | null
}): NotificationMessage {
  return {
    title: input.heading,
    preheader: input.intro.slice(0, 120),
    hero: null,
    intro: input.intro,
    facts: input.rows.map(([label, value], index) => ({ key: `row-${index}`, label, value })),
    primaryAction: input.actionUrl && input.actionLabel ? { url: input.actionUrl, label: input.actionLabel } : undefined,
    category: 'account_security',
    organizationName: input.organizationName,
  }
}

export function reviewRequestMessage(input: {
  guestName: string
  organizationName: string
  locationName: string | null
  visitAt: string
  partySize: string
  reviewUrl: string
  optOutUrl: string
  reminder: boolean
}): NotificationMessage {
  return {
    title: input.reminder ? `How was your visit to ${input.organizationName}?` : `Thanks for visiting ${input.organizationName}`,
    preheader: input.reminder
      ? `${input.organizationName} is still hoping to hear how it went.`
      : `${input.organizationName} would love to hear how everything went.`,
    hero: null,
    intro: `Thanks for visiting, ${input.guestName}. A couple of lines helps other guests know what to expect.`,
    facts: facts(
      fact('visitAt', 'Visit', input.visitAt),
      fact('partySize', 'Party size', input.partySize),
      fact('location', 'Location', input.locationName),
    ),
    primaryAction: { url: input.reviewUrl, label: 'Leave a review' },
    finePrint: `Would rather not be asked? Opt out: ${input.optOutUrl}`,
    category: 'account_security',
    organizationName: input.organizationName,
  }
}

export function articleAnnouncementMessage(input: {
  title: string
  summary: string | null
  coverImageUrl: string | null
  articleUrl: string
}): NotificationMessage {
  return {
    title: input.title,
    preheader: input.summary ?? input.title,
    hero: input.coverImageUrl ? { imageUrl: input.coverImageUrl, alt: '' } : null,
    intro: input.summary ?? undefined,
    facts: [],
    primaryAction: { url: input.articleUrl, label: 'Read the article' },
    category: 'product_news',
  }
}
