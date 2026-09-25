import { formatCalendarDate, formatTime } from '~/utils/timezone'
import { getGuestRequest } from '~/server/domain/requests'
import type { DbClient } from '~/server/db'
import { getEmailDeliveryMode, hashEmail, isReservedTestDomain, sendEmail } from '~/server/utils/email-delivery'
import { buildWhatsAppTemplatePayload, sendWhatsAppNotification, type WhatsAppTemplate } from '~/server/utils/whatsapp'
import { getWhatsAppDeliveryMode } from '~/server/utils/whatsapp-delivery'
import { buildReplyToAddress } from '~/server/utils/submission-messages'
import { listOrganizationNotificationMembers } from '~/server/utils/member-access'
import { wantsNotification } from '~/server/domain/notification-preferences'
import { buildUnsubscribeUrls } from '~/server/utils/unsubscribe'
import type { NotificationCategory } from '~/shared/notification-categories'
import { renderNotificationEmail } from '~/server/emails/render'
import { toWhatsAppVars } from '~/server/notifications/whatsapp-mapping'
import { NOTIFICATION_CATALOG } from '~/server/notifications/catalog'
import { locationHero, productHero, resolveHero, organizationLogo } from '~/server/notifications/hero'
import {
  guestBookingCancelledMessage,
  guestBookingReceivedMessage,
  guestContactReceivedMessage,
  guestReservationCancelledMessage,
  guestReservationReceivedMessage,
  organizationInviteMessage,
  reviewRequestMessage,
} from '~/server/notifications/guest-events'
import type { NotificationMessage } from '~/server/notifications/messages'
import {
  bookingCancelledMessage,
  bookingChangeMessage,
  bookingCreatedMessage,
  contactReceivedMessage,
  guestReplyMessage,
  reservationCancelledMessage,
  reservationCreatedMessage,
  reviewReceivedMessage,
} from '~/server/notifications/events'
import type { CloudflareEnv } from '~/server/utils/auth'
import { createCanonicalNotification } from '~/server/utils/notification-center'
import { buildOwnerThreadInboxUrl, dashboardOrigin, getPlatformDomain, resolveDashboardSlugs } from '~/server/utils/dashboard-notification-links'
import { claimDelivery, createDeliveryReceipt, getDeliveryClaimEligibility, recordDeliveryOutcome } from '~/server/domain/guest-threads/deliveries'
import { appendEntry, findEntryByDedupeKey } from '~/server/domain/guest-threads/entries'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import type { GuestThreadDeliveryPurpose } from '~/server/domain/guest-threads/types'

const SUBJECT_LABELS: Record<string, string> = {
  general: 'General',
  press: 'Press',
  partnerships: 'Partnerships',
  catering: 'Catering',
  careers: 'Careers',
}

type NotificationChannel = 'email' | 'whatsapp'

interface NotificationEnv extends CloudflareEnv {
  RESEND_API_KEY?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
  EMAIL_FROM?: string
  EMAIL_DELIVERY_MODE?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
  EMAIL_REPLY_SECRET?: string
  GUEST_INBOX_HUBS?: DurableObjectNamespace
}

interface OrganizationContext {
  organizationId: string
  organizationName?: string | null
}

interface ReservationNotificationInput extends OrganizationContext {
  locationId?: string | null
  locationName?: string | null
  reservationId: string
  guestName: string
  email: string
  /** A guest who gave no phone number has none to show; the template says so. */
  phone: string | null
  date: string
  time: string
  guests: string
  requests?: string | null
  wasConfirmed?: boolean
  cancelUrl?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  ownerInboxUrl?: string | null
}

interface ContactNotificationInput extends OrganizationContext {
  productTitle?: string | null
  locationId?: string | null
  contactId: string
  guestName: string
  email: string
  subject?: string | null
  message: string
  consentAcknowledged?: boolean
}

interface BookingNotificationInput extends OrganizationContext {
  /** So the email can lead with the experience's own photo. */
  productId?: string | null
  locationId?: string | null
  bookingId: string
  guestName: string
  email: string
  guestPhone?: string | null
  productTitle: string
  /**
   * The session instant and the zone it belongs to.
   *
   * One instant plus one zone, not a date string and a time string: the pair
   * had no zone of its own, so every formatter had to guess, and a 7pm class
   * became a noon one in whatever zone the worker happened to run in.
   */
  startsAt: string
  timezone: string
  partySize: number
  notes?: string | null
  wasConfirmed?: boolean
  cancelUrl?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  ownerInboxUrl?: string | null
}

interface ReviewNotificationInput extends OrganizationContext {
  locationId?: string | null
  reviewId: string
  authorName: string
  rating: number
  content?: string | null
}

interface ReviewRequestNotificationInput extends OrganizationContext {
  locationId?: string | null
  requestId: string
  bookingType: 'reservation' | 'booking'
  bookingId: string
  guestName: string
  email: string
  locationName?: string | null
  bookingPhrase: string
  visitAt: string
  partySize: string
  reviewUrl: string
  optOutUrl: string
}

interface EmailTemplate {
  subject: string
  html: string
  text: string
}

interface ThreadDeliveryContext {
  threadId: string
  entryId: string
  purpose: GuestThreadDeliveryPurpose
  idempotencyKey: string
}

interface GuestThreadReplyNotificationInput extends OrganizationContext {
  locationId?: string | null
  threadId: string
  sourceEntryId: string
  submissionType: 'contact' | 'reservation' | 'booking'
  submissionId: string
  guestName: string
  guestEmail?: string | null
  guestPhone?: string | null
  inboundChannel: 'email' | 'whatsapp'
  messagePreview: string
}

function organizationName(opts: OrganizationContext): string {
  const value = opts.organizationName?.trim()
  if (!value) throw new Error('Tenant site name is required for notifications')
  return value
}

// The WhatsApp "Reply in dashboard" button URL is declared in the approved Meta
// template as a fixed prefix + single {{1}} variable, so only the path/query
// suffix after that prefix can be sent per-message.



// Deep-links an owner notification straight to the dashboard inbox thread for that submission.
async function buildOwnerInboxUrl(
  env: NotificationEnv,
  db: DbClient,
  opts: {
    organizationId: string
    locationId?: string | null
    tab: 'contact' | 'reservations' | 'bookings'
    submissionId: string
  }
): Promise<string | null> {
  const submissionType = opts.tab === 'contact' ? 'contact' : opts.tab === 'reservations' ? 'reservation' : 'booking'
  try {
    const thread = await getGuestRequest(db, opts.submissionId, opts.organizationId, submissionType)
    if (!thread) throw new Error('Submission not found')
    await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.created' })
    return await buildOwnerThreadInboxUrl(env, db, {
      organizationId: opts.organizationId,
      locationId: opts.locationId,
      threadId: thread.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Submission not found')) return null
    throw error instanceof Error ? error : new Error(message)
  }
}

// Deep-links an owner notification to the Reviews tab of Reviews and Q&A, at
// the location the review belongs to when it has one.
async function buildOwnerReviewsUrl(
  env: NotificationEnv,
  db: DbClient,
  opts: { organizationId: string; locationId?: string | null }
): Promise<string | null> {
  const slugs = await resolveDashboardSlugs(env, db, opts)
  if (!slugs) return null

  const base = dashboardOrigin(env, slugs)
  return `${slugs.locationSlug ? `${base}/locations/${slugs.locationSlug}` : base}/qa?tab=reviews`
}

/**
 * One person this alert reaches, and where.
 *
 * `email` and `phone` are null when that channel is not theirs to receive on —
 * they switched the category off, or they have no verified phone. The account
 * is the address for both: there is no configured number any more, so there is
 * no way to name a recipient the product cannot also identify.
 */
export interface OwnerRecipient {
  userId: string
  email: string | null
  phone: string | null
  /** The footer link a person clicks. */
  unsubscribeUrl: string | null
  /** The RFC 8058 endpoint a mail client POSTs to. */
  unsubscribeOneClickUrl: string | null
}

/**
 * Who actually receives this alert, on which channel.
 *
 * Both channels resolve from Better Auth membership and each person's own
 * `user_notification_preferences`. WhatsApp used to resolve from a number typed
 * into a location or organization settings field instead, which made "who gets
 * told" answerable two ways: a tenant could configure a number no account held,
 * and the send was refused to a console line no tenant could read. A number is
 * now reached because a member proved they hold it, which is the same rule
 * email has always followed.
 */
async function resolveOwnerRecipients(
  env: NotificationEnv,
  db: DbClient,
  opts: {
    organizationId: string
    category: NotificationCategory
  },
): Promise<OwnerRecipient[]> {
  const members = await listOrganizationNotificationMembers(env, opts.organizationId)
  const recipients = await Promise.all(members.map(async (member) => {
    const [wantsEmail, wantsWhatsApp] = await Promise.all([
      wantsNotification(db, member.userId, opts.category, 'email'),
      member.phone ? wantsNotification(db, member.userId, opts.category, 'whatsapp') : Promise.resolve(false),
    ])
    if (!wantsEmail && !wantsWhatsApp) return null
    const unsubscribe = await buildUnsubscribeUrls(env, { userId: member.userId, category: opts.category })
    return {
      userId: member.userId,
      email: wantsEmail ? member.email : null,
      phone: wantsWhatsApp ? member.phone : null,
      unsubscribeUrl: unsubscribe?.pageUrl ?? null,
      unsubscribeOneClickUrl: unsubscribe?.oneClickUrl ?? null,
    }
  }))
  return recipients.filter((recipient): recipient is OwnerRecipient => recipient !== null)
}


async function sendEmailNotification(
  env: NotificationEnv,
  db: DbClient,
  opts: Omit<OrganizationContext, 'organizationId'> & { organizationId: string | null } & {
    locationId?: string | null
    to: string
    replyTo?: string | null
    template: string
    title: string
    payload: Record<string, string>
    email: EmailTemplate
    unsubscribeUrl?: string | null
    unsubscribeOneClickUrl?: string | null
    delivery?: ThreadDeliveryContext | null
  }
): Promise<void> {
  const provider = getEmailDeliveryMode(env) === 'provider' && !isReservedTestDomain(opts.to)
    ? 'resend'
    : 'log_only'
  const deliveryContext = opts.delivery
  const delivery = deliveryContext
    ? await createDeliveryReceipt(db, {
        entryId: deliveryContext.entryId,
        channel: 'email',
        provider,
        purpose: deliveryContext.purpose,
        idempotencyKey: deliveryContext.idempotencyKey,
      })
    : null
  const claim = delivery ? await claimDelivery(db, delivery.id) : null
  if (claim && !claim.claimed) {
    const succeeded = claim.delivery.status === 'sent' || claim.delivery.status === 'delivered' || claim.delivery.status === 'read'
    const eligibility = getDeliveryClaimEligibility(claim.delivery)
    if (!succeeded && claim.delivery.provider === 'resend' && (eligibility === 'claimable' || eligibility === 'in_flight')) {
      throw new Error('Email delivery remains eligible for webhook retry')
    }
    // Another worker owns this receipt. If it settled as sent there is nothing
    // left to do; if it settled as failed, this call has no delivery either, and
    // says so rather than resolving as though it had one.
    if (!succeeded) throw new Error(`Email delivery already settled as ${claim.delivery.status}: ${claim.delivery.error ?? 'no provider error recorded'}`)
    return
  }

  const result = await sendEmail(env, {
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.email.subject,
    html: opts.email.html,
    text: opts.email.text,
    unsubscribeOneClickUrl: opts.unsubscribeOneClickUrl ?? null,
    idempotencyKey: delivery?.id,
  })
  let requestWebhookRetry = false
  if (claim?.claimed && deliveryContext) {
    const outcome = await recordDeliveryOutcome(db, {
      claim,
      status: result.status,
      providerMessageId: result.status === 'sent' ? result.messageId : null,
      error: result.status === 'sent' ? null : result.error,
    })
    await publishGuestInboxThreadEvent(env, db, { threadId: deliveryContext.threadId, type: 'delivery.changed' })
    const eligibility = getDeliveryClaimEligibility(outcome)
    requestWebhookRetry = outcome.provider === 'resend' && (eligibility === 'claimable' || eligibility === 'in_flight')
  }
  if (result.status === 'sent') {
    console.info(provider === 'log_only' ? 'email_delivery_log_only' : 'email_delivery_sent', {
      organizationId: opts.organizationId,
      template: opts.template,
      recipient: hashEmail(opts.to),
      title: opts.title,
      providerMessageId: result.messageId,
    })
    return
  }
  // A send that will not be retried is a terminal failure, and it is raised.
  // Returning false made a failed delivery indistinguishable from a successful
  // one to Promise.allSettled, which is how a booking could answer 200 with the
  // owner's email never sent. The outcome is already recorded against the
  // delivery receipt above; this is what makes the caller account for it.
  console.error('email_delivery_failed', {
    organizationId: opts.organizationId,
    template: opts.template,
    status: result.status,
    error: result.error,
  })
  if (requestWebhookRetry) throw new Error('Email delivery remains eligible for webhook retry')
  throw new Error(`Email delivery failed (${result.status}): ${result.error ?? 'no provider error reported'}`)
}

async function sendWhatsAppThreadNotification(
  env: NotificationEnv,
  db: DbClient,
  opts: {
    organizationId: string
    locationId?: string | null
    toPhone: string
    template: WhatsAppTemplate
    vars: Record<string, string>
    delivery: ThreadDeliveryContext
  },
): Promise<boolean> {
  const delivery = await createDeliveryReceipt(db, {
    entryId: opts.delivery.entryId,
    channel: 'whatsapp',
    provider: getWhatsAppDeliveryMode(env) === 'provider' ? 'meta' : 'log_only',
    purpose: opts.delivery.purpose,
    idempotencyKey: opts.delivery.idempotencyKey,
  })
  const claim = await claimDelivery(db, delivery.id)
  if (!claim.claimed) {
    return claim.delivery.status === 'sent' || claim.delivery.status === 'delivered' || claim.delivery.status === 'read'
  }

  let result: Awaited<ReturnType<typeof sendWhatsAppNotification>>
  try {
    result = await sendWhatsAppNotification(env, opts)
  } catch (error) {
    await recordDeliveryOutcome(db, {
      claim,
      status: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    })
    await publishGuestInboxThreadEvent(env, db, { threadId: opts.delivery.threadId, type: 'delivery.changed' })
    throw error
  }

  await recordDeliveryOutcome(db, {
    claim,
    status: result.status,
    providerMessageId: result.status === 'sent' ? result.messageId ?? null : null,
    error: result.success ? null : result.error,
  })
  await publishGuestInboxThreadEvent(env, db, { threadId: opts.delivery.threadId, type: 'delivery.changed' })
  return result.success
}

async function getOpeningThreadContext(
  db: DbClient,
  submissionType: 'contact' | 'reservation' | 'booking',
  submissionId: string,
): Promise<{ guestThreadId: string; sourceEntryId: string }> {
  const thread = await getGuestRequest(db, submissionId, undefined, submissionType)
  if (!thread) throw new Error('Submission notification has no canonical request')
  const entry = await findEntryByDedupeKey(db, `request:${submissionId}:submission`)
  if (!entry) throw new Error('Submission notification has no opening activity entry')
  return { guestThreadId: thread.id, sourceEntryId: entry.id }
}

function threadDelivery(
  context: { guestThreadId: string; sourceEntryId: string } | null,
  purpose: GuestThreadDeliveryPurpose,
  channel: NotificationChannel,
  template: string,
  recipient: string,
): ThreadDeliveryContext | null {
  if (!context) return null
  return {
    threadId: context.guestThreadId,
    entryId: context.sourceEntryId,
    purpose,
    idempotencyKey: `${context.sourceEntryId}:${purpose}:${channel}:${template}:${hashEmail(recipient)}`,
  }
}

async function recordGuestCancellation(
  db: DbClient,
  input: {
    submissionType: 'reservation' | 'booking'
    submissionId: string
    organizationId: string
    subject: string
    body: string
    wasConfirmed: boolean
  },
): Promise<{ guestThreadId: string; sourceEntryId: string } | null> {
  const thread = await getGuestRequest(db, input.submissionId, undefined, input.submissionType)
  if (!thread) return null
  const entry = await appendEntry(db, {
    threadId: thread.id,
    kind: 'operation',
    actorKind: 'guest',
    channel: 'web',
    body: input.body,
    eventName: `${input.submissionType}.guest_cancelled`,
    payloadJson: { subject: input.subject, wasConfirmed: input.wasConfirmed },
    dedupeKey: `guest-cancellation:${input.submissionType}:${input.submissionId}`,
  })
  return { guestThreadId: thread.id, sourceEntryId: entry.id }
}


// Both sends are attempted before either failure is raised: an owner alert that
// fails must not cancel the guest's acknowledgement, nor the reverse. But a send
// that failed is a failure, so it is raised rather than logged. Logging it here
// is what let a booking answer 200 while the business was never told — the
// per-channel outcome is already durable in guest_thread_deliveries; this is
// what stops the route above from reporting success it did not have.
export function raiseSettledFailures(
  label: string,
  context: string,
  results: readonly PromiseSettledResult<unknown>[],
  tasks: readonly string[] = ['notifyOwner', 'sendEmailNotification'],
): void {
  const failed = results.flatMap((result, index) =>
    result.status === 'rejected' ? [{ task: tasks[index] ?? String(index), reason: result.reason }] : [])
  if (failed.length === 0) return
  throw new AggregateError(
    failed.map(({ reason }) => reason instanceof Error ? reason : new Error(String(reason))),
    `${label} failed for ${context}: ${failed.map(({ task }) => task).join(' and ')}`,
  )
}

async function notifyOwner(
  env: NotificationEnv,
  db: DbClient,
  opts: OrganizationContext & {
    locationId?: string | null
    template: string
    title: string
    payload: Record<string, string>
    /**
     * The event, described once. The email is rendered from it after the
     * recipient is known — so the footer carries that person's own opt-out
     * link — and the WhatsApp vars are selected from the same facts, so the
     * two channels cannot describe the event differently.
     */
    message: NotificationMessage
    /** The approved template the same facts are mapped onto. */
    whatsappTemplate?: WhatsAppTemplate
    submissionType?: 'contact' | 'reservation' | 'booking' | 'invitation' | null
    submissionId?: string | null
    notificationSource?: { threadId: string; entryId: string }
  }
) {
  const threadContext = opts.notificationSource
    ? { guestThreadId: opts.notificationSource.threadId, sourceEntryId: opts.notificationSource.entryId }
    : opts.submissionType && opts.submissionType !== 'invitation' && opts.submissionId
      ? await getOpeningThreadContext(db, opts.submissionType, opts.submissionId)
      : null
  await createCanonicalNotification(db, {
    publishEnv: env,
    scope: 'organization',
    template: opts.template,
    organizationId: opts.organizationId,
    locationId: opts.locationId ?? null,
    sourceEntryId: threadContext?.sourceEntryId ?? null,
    idempotencyKey: threadContext ? `notification:${threadContext.sourceEntryId}:${opts.template}` : undefined,
    title: opts.title,
    threadId: threadContext?.guestThreadId ?? null,
    deepLink: opts.payload.deep_link || null,
  })

  const recipients = await resolveOwnerRecipients(env, db, {
    organizationId: opts.organizationId,
    category: opts.message.category,
  })

  const whatsappVars = opts.whatsappTemplate && recipients.some(recipient => recipient.phone)
    ? toWhatsAppVars(opts.message, opts.whatsappTemplate)
    : null
  if (whatsappVars?.omitted.length) {
    // Declared in WHATSAPP_MAPPINGS.cannotCarry and enforced by
    // lint:notification-parity, so this is a record of a known template
    // limit rather than a surprise.
    console.info('whatsapp_facts_omitted', { template: opts.whatsappTemplate, omitted: whatsappVars.omitted })
  }

  const results = await Promise.allSettled(recipients.flatMap((recipient) => {
    const sends: Array<Promise<unknown>> = []
    if (recipient.email) {
      const to = recipient.email
      sends.push((async () => {
        // Rendered per person: the footer carries that recipient's own opt-out
        // link, so the same event cannot hand one member another's.
        const rendered = await renderNotificationEmail(opts.message, {
          platformDomain: getPlatformDomain(env),
          preferencesUrl: `https://${getPlatformDomain(env)}/dashboard/account/profile/notifications`,
          unsubscribeUrl: recipient.unsubscribeUrl,
        })
        await sendEmailNotification(env, db, {
          ...opts,
          to,
          email: { subject: sanitizeEmailHeaderValue(opts.message.title), html: rendered.html, text: rendered.text },
          unsubscribeOneClickUrl: recipient.unsubscribeOneClickUrl,
          delivery: threadDelivery(threadContext, 'owner_alert', 'email', opts.template, to),
        })
      })())
    }
    if (recipient.phone && opts.whatsappTemplate && whatsappVars) {
      const toPhone = recipient.phone
      const sendOptions = {
        organizationId: opts.organizationId,
        locationId: opts.locationId ?? null,
        toPhone,
        template: opts.whatsappTemplate,
        vars: whatsappVars.vars,
      }
      const delivery = threadDelivery(threadContext, 'owner_alert', 'whatsapp', opts.template, toPhone)
      // A refused send resolves rather than throwing, so without this the
      // settled-failure check sees a fulfilled promise and reports nothing —
      // the alert is lost exactly as quietly as the console line it replaced.
      sends.push((async () => {
        if (delivery) {
          if (!await sendWhatsAppThreadNotification(env, db, { ...sendOptions, delivery })) {
            throw new Error(`WhatsApp owner alert was not delivered for organization ${opts.organizationId}`)
          }
          return
        }
        const result = await sendWhatsAppNotification(env, sendOptions)
        if (!result.success) {
          throw new Error(`WhatsApp owner alert was not delivered for organization ${opts.organizationId}: ${result.error}`)
        }
      })())
    }
    return sends
  }))
  raiseSettledFailures('notifyOwner', `organization ${opts.organizationId}`, results,
    results.map(() => 'ownerAlert'))
}

// Email subjects go into a header context, not HTML — strip CR/LF so a guest name can't
// inject additional headers, independent of the HTML-body escaping used elsewhere.
function sanitizeEmailHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export async function notifyReservationCreated(
  env: NotificationEnv,
  db: DbClient,
  opts: ReservationNotificationInput
) {
  const restaurant = organizationName(opts)
  const prettyDate = formatCalendarDate(opts.date, 'en')
  const prettyTime = formatTime(opts.time, 'en')
  const platformDomain = getPlatformDomain(env)
  const [replyTo, inboxUrl] = await Promise.all([
    buildReplyToAddress(env, 'reservation', opts.reservationId),
    opts.ownerInboxUrl !== undefined
      ? opts.ownerInboxUrl
      : buildOwnerInboxUrl(env, db, {
          organizationId: opts.organizationId,
          locationId: opts.locationId,
          tab: 'reservations',
          submissionId: opts.reservationId,
        }),
  ])
  const threadContext = await getOpeningThreadContext(db, 'reservation', opts.reservationId)

  const payload = {
    reservation_id: opts.reservationId,
    guest_name: opts.guestName,
    email: opts.email,
    phone: opts.phone ?? '',
    date: opts.date,
    time: opts.time,
    guests: opts.guests,
    requests: opts.requests ?? '',
    location_name: opts.locationName ?? '',
    organization_name: restaurant,
    deep_link: inboxUrl ?? '',
  }

  const [hero, logoUrl] = await Promise.all([
    resolveHero(() => locationHero(db, opts.organizationId, opts.locationId)),
    organizationLogo(db, opts.organizationId),
  ])
  const ownerMessage = reservationCreatedMessage({
    guestName: opts.guestName, guestEmail: opts.email, guestPhone: opts.phone ?? null,
    date: prettyDate, time: prettyTime, partySize: opts.guests,
    locationName: opts.locationName ?? null, organizationName: restaurant,
    notes: opts.requests ?? null, heroImageUrl: hero?.imageUrl ?? null, replyUrl: inboxUrl,
  })
  const guestEmail = await renderNotificationEmail(guestReservationReceivedMessage({
    guestName: opts.guestName, organizationName: restaurant, organizationLogoUrl: logoUrl,
    date: prettyDate, time: prettyTime, partySize: opts.guests, notes: opts.requests,
    locationName: opts.locationName, contactPhone: opts.contactPhone, contactEmail: opts.contactEmail,
    cancelUrl: opts.cancelUrl, heroImageUrl: hero?.imageUrl ?? null,
  }), { platformDomain })

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'reservation',
      submissionId: opts.reservationId,
      template: 'new_reservation',
      title: ownerMessage.title,
      payload,
      message: ownerMessage,
      whatsappTemplate: 'new_reservation',
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      replyTo,
      template: 'reservation_customer_received',
      title: 'Your reservation is confirmed',
      payload,
      email: { subject: 'Your reservation is confirmed', html: guestEmail.html, text: guestEmail.text },
      delivery: threadDelivery(threadContext, 'guest_acknowledgement', 'email', 'reservation_customer_received', opts.email),
    }),
  ])

  raiseSettledFailures('notifyReservationCreated', `reservationId ${opts.reservationId}`, results)
}

export async function notifyReservationCancelled(
  env: NotificationEnv,
  db: DbClient,
  opts: ReservationNotificationInput
) {
  const confirmed = Boolean(opts.wasConfirmed)
  const restaurant = organizationName(opts)
  const prettyDate = formatCalendarDate(opts.date, 'en')
  const prettyTime = formatTime(opts.time, 'en')
  const platformDomain = getPlatformDomain(env)
  const inboxUrl = await buildOwnerInboxUrl(env, db, {
    organizationId: opts.organizationId,
    locationId: opts.locationId,
    tab: 'reservations',
    submissionId: opts.reservationId,
  })
    ? `Reservation cancelled for ${opts.guestName}`
    : `Reservation request cancelled by ${opts.guestName}`
  const guestCancelTitle = confirmed ? 'Your reservation was cancelled' : 'Your reservation request was cancelled'

  const payload = {
    reservation_id: opts.reservationId,
    guest_name: opts.guestName,
    email: opts.email,
    phone: opts.phone ?? '',
    date: opts.date,
    time: opts.time,
    guests: opts.guests,
    reservation_was_confirmed: confirmed ? 'true' : 'false',
    location_name: opts.locationName ?? '',
    organization_name: restaurant,
    deep_link: inboxUrl ?? '',
  }

  const ownerMessage = reservationCancelledMessage({
    guestName: opts.guestName, guestEmail: opts.email, guestPhone: opts.phone ?? null,
    date: prettyDate, time: prettyTime, partySize: opts.guests,
    locationName: opts.locationName ?? null, organizationName: restaurant,
    notes: opts.requests ?? null, heroImageUrl: null, replyUrl: inboxUrl,
    wasConfirmed: confirmed,
  })
  const guestEmail = await renderNotificationEmail(guestReservationCancelledMessage({
    guestName: opts.guestName, organizationName: restaurant, date: prettyDate, time: prettyTime,
    partySize: opts.guests, notes: opts.requests, locationName: opts.locationName, wasConfirmed: confirmed,
  }), { platformDomain })
  const threadContext = await recordGuestCancellation(db, {
    submissionType: 'reservation',
    submissionId: opts.reservationId,
    organizationId: opts.organizationId,
    subject: guestCancelTitle,
    body: guestEmail.text,
    wasConfirmed: confirmed,
  })

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'reservation',
      submissionId: opts.reservationId,
      template: 'reservation_cancelled',
      title: ownerMessage.title,
      payload,
      message: ownerMessage,
      whatsappTemplate: 'reservation_cancelled',
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'reservation_customer_cancelled',
      title: guestCancelTitle,
      payload,
      email: { subject: guestCancelTitle, html: guestEmail.html, text: guestEmail.text },
      delivery: threadDelivery(threadContext, 'status_update', 'email', 'reservation_customer_cancelled', opts.email),
    }),
  ])

  raiseSettledFailures('notifyReservationCancelled', `reservationId ${opts.reservationId}`, results)
}

export async function notifyContactSubmitted(
  env: NotificationEnv,
  db: DbClient,
  opts: ContactNotificationInput
) {
  const restaurant = organizationName(opts)
  const platformDomain = getPlatformDomain(env)
  const replyTo = await buildReplyToAddress(env, 'contact', opts.contactId)
  const inboxUrl = await buildOwnerInboxUrl(env, db, {
    organizationId: opts.organizationId,
    locationId: opts.locationId,
    tab: 'contact',
    submissionId: opts.contactId,
  })
  const threadContext = await getOpeningThreadContext(db, 'contact', opts.contactId)
  const payload = {
    contact_id: opts.contactId,
    guest_name: opts.guestName,
    email: opts.email,
    subject: opts.subject ?? '',
    message_preview: opts.message.slice(0, 200),
    organization_name: restaurant,
    experience_title: opts.productTitle ?? '',
    consent_acknowledged: opts.consentAcknowledged === true ? 'true' : 'false',
    deep_link: inboxUrl ?? '',
  }

  const ownerMessage = contactReceivedMessage({
    guestName: opts.guestName, guestEmail: opts.email,
    subject: SUBJECT_LABELS[opts.subject ?? 'general'] ?? opts.subject ?? 'General',
    message: opts.message, productTitle: opts.productTitle ?? null,
    organizationName: restaurant, consentAcknowledged: Boolean(opts.consentAcknowledged), replyUrl: inboxUrl,
  })
  const guestEmail = await renderNotificationEmail(guestContactReceivedMessage({
    guestName: opts.guestName, organizationName: restaurant,
    subject: opts.subject ? (SUBJECT_LABELS[opts.subject] ?? opts.subject) : null,
    productTitle: opts.productTitle ?? null, message: opts.message,
    consentAcknowledged: Boolean(opts.consentAcknowledged),
  }), { platformDomain })

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'contact',
      submissionId: opts.contactId,
      template: 'new_contact_msg',
      title: ownerMessage.title,
      payload,
      message: ownerMessage,
      whatsappTemplate: 'new_contact_msg',
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      replyTo,
      template: 'contact_customer_received',
      title: 'Your message was sent',
      payload,
      email: { subject: 'Your message was sent', html: guestEmail.html, text: guestEmail.text },
      delivery: threadDelivery(threadContext, 'guest_acknowledgement', 'email', 'contact_customer_received', opts.email),
    }),
  ])

  raiseSettledFailures('notifyContactSubmitted', `contactId ${opts.contactId}`, results)

}

export async function notifyReviewReceived(
  env: NotificationEnv,
  db: DbClient,
  opts: ReviewNotificationInput
) {
  const restaurant = organizationName(opts)
  const reviewsUrl = await buildOwnerReviewsUrl(env, db, {
    organizationId: opts.organizationId,
    locationId: opts.locationId,
  })

  const ownerMessage = reviewReceivedMessage({
    authorName: opts.authorName,
    rating: opts.rating,
    content: opts.content ?? '',
    organizationName: restaurant,
    reviewsUrl,
  })

  await notifyOwner(env, db, {
    ...opts,
    template: 'new_review',
    title: ownerMessage.title,
    payload: {
      review_id: opts.reviewId,
      author_name: opts.authorName,
      rating: String(opts.rating),
      content_preview: (opts.content ?? '').slice(0, 200),
      organization_name: restaurant,
      deep_link: reviewsUrl ?? '',
    },
    message: ownerMessage,
    whatsappTemplate: 'new_review',
  })
}

export async function notifyReviewRequest(
  env: NotificationEnv,
  db: DbClient,
  opts: ReviewRequestNotificationInput
): Promise<void> {
  const restaurant = organizationName(opts)
  const platformDomain = getPlatformDomain(env)

  const email = await renderNotificationEmail(reviewRequestMessage({
    guestName: opts.guestName,
    organizationName: restaurant,
    locationName: opts.locationName ?? null,
    visitAt: opts.visitAt,
    partySize: opts.partySize,
    reviewUrl: opts.reviewUrl,
    optOutUrl: opts.optOutUrl,
  }), { platformDomain })

  await sendEmailNotification(env, db, {
    ...opts,
    to: opts.email,
    template: 'booking_thank_you_review_request',
    title: `Review request for ${opts.bookingPhrase}`,
    payload: {
      request_id: opts.requestId,
      booking_type: opts.bookingType,
      booking_id: opts.bookingId,
      guest_name: opts.guestName,
      booking_phrase: opts.bookingPhrase,
      visit_at: opts.visitAt,
      party_size: opts.partySize,
      review_url: opts.reviewUrl,
      opt_out_url: opts.optOutUrl,
      organization_name: restaurant,
    },
    email: {
      subject: `How was your visit to ${restaurant}?`,
      html: email.html,
      text: email.text,
    },
  })
}

export async function notifyBookingCreated(
  env: NotificationEnv,
  db: DbClient,
  opts: BookingNotificationInput
) {
  const studio = organizationName(opts)
  const prettyDate = new Intl.DateTimeFormat('en-US', { timeZone: opts.timezone, dateStyle: 'medium' }).format(new Date(opts.startsAt))
  const prettyTime = new Intl.DateTimeFormat('en-US', { timeZone: opts.timezone, timeStyle: 'short' }).format(new Date(opts.startsAt))
  const platformDomain = getPlatformDomain(env)
  const [replyTo, inboxUrl] = await Promise.all([
    buildReplyToAddress(env, 'booking', opts.bookingId),
    opts.ownerInboxUrl !== undefined
      ? opts.ownerInboxUrl
      : buildOwnerInboxUrl(env, db, {
          organizationId: opts.organizationId,
          locationId: opts.locationId,
          tab: 'bookings',
          submissionId: opts.bookingId,
        }),
  ])
  const threadContext = await getOpeningThreadContext(db, 'booking', opts.bookingId)

  const payload = {
    booking_id: opts.bookingId,
    guest_name: opts.guestName,
    email: opts.email,
    experience: opts.productTitle,
    starts_at: opts.startsAt,
    timezone: opts.timezone,
    party_size: String(opts.partySize),
    requests: opts.notes ?? '',
    organization_name: studio,
    deep_link: inboxUrl ?? '',
  }

  const [hero, logoUrl] = await Promise.all([
    resolveHero(() => productHero(db, opts.organizationId, opts.productId)),
    organizationLogo(db, opts.organizationId),
  ])
  const ownerMessage = bookingCreatedMessage({
    guestName: opts.guestName, guestEmail: opts.email, guestPhone: opts.guestPhone ?? null,
    date: prettyDate, time: prettyTime, partySize: String(opts.partySize),
    locationName: null, organizationName: studio, productTitle: opts.productTitle,
    notes: opts.notes ?? null, heroImageUrl: hero?.imageUrl ?? null, replyUrl: inboxUrl,
  })
  const guestEmail = await renderNotificationEmail(guestBookingReceivedMessage({
    guestName: opts.guestName, organizationName: studio, organizationLogoUrl: logoUrl,
    productTitle: opts.productTitle, date: prettyDate, time: prettyTime, partySize: String(opts.partySize),
    notes: opts.notes, contactPhone: opts.contactPhone ?? null, contactEmail: opts.contactEmail ?? null,
    cancelUrl: opts.cancelUrl ?? null, heroImageUrl: hero?.imageUrl ?? null,
  }), { platformDomain })

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'booking',
      submissionId: opts.bookingId,
      // A booking is not a reservation. Recording both under 'new_reservation'
      // meant the canonical record could not tell an experience booking from a
      // restaurant table — the cancelled path already names itself correctly.
      template: 'new_booking',
      title: ownerMessage.title,
      payload,
      message: ownerMessage,
      whatsappTemplate: 'new_reservation',
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      replyTo,
      template: 'booking_customer_received',
      title: `Your booking request was sent — ${opts.productTitle}`,
      payload,
      email: { subject: `Your booking request was sent — ${opts.productTitle}`, html: guestEmail.html, text: guestEmail.text },
      delivery: threadDelivery(threadContext, 'guest_acknowledgement', 'email', 'booking_customer_received', opts.email),
    }),
  ])

  raiseSettledFailures('notifyBookingCreated', `bookingId ${opts.bookingId}`, results)
}

export async function notifyBookingCancelled(
  env: NotificationEnv,
  db: DbClient,
  opts: BookingNotificationInput
) {
  const confirmed = Boolean(opts.wasConfirmed)
  const studio = organizationName(opts)
  const prettyDate = new Intl.DateTimeFormat('en-US', { timeZone: opts.timezone, dateStyle: 'medium' }).format(new Date(opts.startsAt))
  const prettyTime = new Intl.DateTimeFormat('en-US', { timeZone: opts.timezone, timeStyle: 'short' }).format(new Date(opts.startsAt))
  const platformDomain = getPlatformDomain(env)
  const inboxUrl = await buildOwnerInboxUrl(env, db, {
    organizationId: opts.organizationId,
    locationId: opts.locationId,
    tab: 'bookings',
    submissionId: opts.bookingId,
  })
    ? `Booking cancelled for ${opts.guestName}`
    : `Booking request cancelled by ${opts.guestName}`
  const guestCancelTitle = confirmed ? 'Your booking was cancelled' : 'Your booking request was cancelled'

  const payload = {
    booking_id: opts.bookingId,
    guest_name: opts.guestName,
    email: opts.email,
    experience: opts.productTitle,
    starts_at: opts.startsAt,
    timezone: opts.timezone,
    party_size: String(opts.partySize),
    booking_was_confirmed: confirmed ? 'true' : 'false',
    organization_name: studio,
    deep_link: inboxUrl ?? '',
  }

  const ownerMessage = bookingCancelledMessage({
    guestName: opts.guestName, guestEmail: opts.email, guestPhone: opts.guestPhone ?? null,
    date: prettyDate, time: prettyTime, partySize: String(opts.partySize),
    locationName: null, organizationName: studio, productTitle: opts.productTitle,
    notes: opts.notes ?? null, heroImageUrl: null, replyUrl: inboxUrl,
    wasConfirmed: confirmed,
  })
  const guestEmail = await renderNotificationEmail(guestBookingCancelledMessage({
    guestName: opts.guestName, organizationName: studio, productTitle: opts.productTitle,
    date: prettyDate, time: prettyTime, partySize: String(opts.partySize), notes: opts.notes, wasConfirmed: confirmed,
  }), { platformDomain })
  const threadContext = await recordGuestCancellation(db, {
    submissionType: 'booking',
    submissionId: opts.bookingId,
    organizationId: opts.organizationId,
    subject: guestCancelTitle,
    body: guestEmail.text,
    wasConfirmed: confirmed,
  })

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'booking',
      submissionId: opts.bookingId,
      template: 'booking_cancelled',
      title: ownerMessage.title,
      payload,
      message: ownerMessage,
      whatsappTemplate: 'reservation_cancelled',
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'booking_customer_cancelled',
      title: guestCancelTitle,
      payload,
      email: { subject: guestCancelTitle, html: guestEmail.html, text: guestEmail.text },
      delivery: threadDelivery(threadContext, 'status_update', 'email', 'booking_customer_cancelled', opts.email),
    }),
  ])

  raiseSettledFailures('notifyBookingCancelled', `bookingId ${opts.bookingId}`, results)
}

/** Notify the tenant through the same dashboard/email/WhatsApp path as other booking events. */
export async function notifyBookingChangeOwner(
  env: NotificationEnv,
  db: DbClient,
  opts: OrganizationContext & {
    locationId: string
    threadId: string
    submissionType: 'reservation' | 'booking'
    submissionId: string
    sourceEntryId: string
    guestName: string
    guestEmail: string
    status: 'requested' | 'accepted' | 'declined'
    noun: string
    /**
     * The occurrence as the guest sees it, already rendered in the
     * location's own timezone. A split date/time pair here would be a second
     * place that has to agree with the session's zone, and it would not.
     */
    whenLabel: string
    /**
     * The same occurrence split for the approved WhatsApp template's date and
     * time slots, derived beside whenLabel from one formatter. Null on
     * proposals recorded before those slots were filled correctly.
     */
    whenDate: string | null
    whenTime: string | null
    guests: number
    locationTitle: string
  },
) {
  const noun = opts.noun
  const title = opts.status === 'requested'
    ? `Changes requested for ${opts.guestName}'s ${noun}`
    : `${opts.guestName} ${opts.status} the ${noun} changes`
  const message = opts.status === 'requested'
    ? 'The guest has been asked to accept or decline. The original details remain unchanged until they accept.'
    : opts.status === 'accepted'
      ? 'The guest accepted. The updated details are now confirmed.'
      : 'The guest declined. The original details remain unchanged.'
  const replyUrl = await buildOwnerThreadInboxUrl(env, db, opts)
  const ownerMessage = bookingChangeMessage({
    recordKind: noun,
    guestName: opts.guestName,
    status: opts.status,
    location: opts.locationTitle,
    date: opts.whenDate,
    time: opts.whenTime,
    whenLabel: opts.whenLabel,
    partySize: String(opts.guests),
    summary: message,
    replyUrl,
    organizationName: organizationName(opts),
  })
  await notifyOwner(env, db, {
    ...opts,
    template: `${noun}.change_${opts.status}`,
    title,
    payload: {
      request_id: opts.threadId,
      submission_type: opts.submissionType,
      submission_id: opts.submissionId,
      status: opts.status,
      deep_link: replyUrl ?? '',
    },
    notificationSource: { threadId: opts.threadId, entryId: opts.sourceEntryId },
    message: ownerMessage,
    whatsappTemplate: 'booking_change_update',
  })
}

export async function notifyGuestThreadReply(
  env: NotificationEnv,
  db: DbClient,
  opts: GuestThreadReplyNotificationInput,
) {
  try {
    await notifyGuestThreadReplyInner(env, db, opts)
  } catch (error) {
    console.error('notifyGuestThreadReply_failed', {
      threadId: opts.threadId,
      submissionType: opts.submissionType,
      submissionId: opts.submissionId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function notifyGuestThreadReplyInner(
  env: NotificationEnv,
  db: DbClient,
  opts: GuestThreadReplyNotificationInput,
) {
  const threadContext = { guestThreadId: opts.threadId, sourceEntryId: opts.sourceEntryId }
  const replyUrl = await buildOwnerThreadInboxUrl(env, db, {
    organizationId: opts.organizationId,
    locationId: opts.locationId,
    threadId: opts.threadId,
  })

  const payload = {
    request_id: opts.threadId,
    submission_type: opts.submissionType,
    submission_id: opts.submissionId,
    guest_name: opts.guestName,
    inbound_channel: opts.inboundChannel,
    message_preview: opts.messagePreview.slice(0, 200),
    deep_link: replyUrl ?? '',
  }

  const title = `New guest reply from ${opts.guestName}`

  const template = opts.inboundChannel === 'email' ? 'submission_reply_email' : 'submission_reply_whatsapp'
  await createCanonicalNotification(db, {
    publishEnv: env,
    scope: 'organization',
    template,
    organizationId: opts.organizationId,
    locationId: opts.locationId ?? null,
    sourceEntryId: opts.sourceEntryId,
    title,
    threadId: threadContext.guestThreadId,
    deepLink: payload.deep_link || null,
  })

  const ownerMessage = guestReplyMessage({
    guestName: opts.guestName,
    guestEmail: opts.guestEmail ?? null,
    inboundChannel: opts.inboundChannel,
    messagePreview: opts.messagePreview,
    organizationName: opts.organizationName ?? null,
    replyUrl,
  })

  const recipients = await resolveOwnerRecipients(env, db, {
    organizationId: opts.organizationId,
    category: ownerMessage.category,
  })

  const results = await Promise.allSettled(recipients.flatMap((recipient) => {
    const sends: Array<Promise<unknown>> = []
    if (recipient.email) {
      const to = recipient.email
      sends.push((async () => {
        await sendEmailNotification(env, db, {
          organizationId: opts.organizationId,
          organizationName: opts.organizationName ?? null,
          locationId: opts.locationId ?? null,
          to,
          template: 'guest_thread_reply_email',
          title,
          payload,
          email: {
            subject: sanitizeEmailHeaderValue(ownerMessage.title),
            ...(await renderNotificationEmail(ownerMessage, {
              platformDomain: getPlatformDomain(env),
              preferencesUrl: `https://${getPlatformDomain(env)}/dashboard/account/profile/notifications`,
              unsubscribeUrl: recipient.unsubscribeUrl,
            })),
          },
          unsubscribeUrl: recipient.unsubscribeUrl,
          unsubscribeOneClickUrl: recipient.unsubscribeOneClickUrl,
          delivery: threadDelivery(threadContext, 'owner_alert', 'email', 'guest_thread_reply_email', to),
        })
      })())
    }
    if (recipient.phone) {
      const toPhone = recipient.phone
      const delivery = threadDelivery(threadContext, 'owner_alert', 'whatsapp', 'guest_thread_reply_whatsapp', toPhone)
      if (!delivery) throw new Error('Guest reply delivery context is missing')
      sends.push((async () => {
        if (!await sendWhatsAppThreadNotification(env, db, {
          organizationId: opts.organizationId,
          locationId: opts.locationId ?? null,
          toPhone,
          template: 'guest_thread_reply_whatsapp',
          vars: toWhatsAppVars(ownerMessage, 'guest_thread_reply_whatsapp').vars,
          delivery,
        })) {
          throw new Error(`WhatsApp guest-reply alert was not delivered for thread ${opts.threadId}`)
        }
      })())
    }
    return sends
  }))
  raiseSettledFailures('notifyGuestThreadReply', `thread ${opts.threadId}`, results,
    results.map(() => 'ownerAlert'))
}

export interface OrganizationInvitationInput {
  organizationId: string
  invitationId: string
  email: string
  role: string
  organizationName: string
  inviterName: string
}

// Called from the Better Auth organization plugin's sendInvitationEmail hook
// (server/utils/auth.ts) — the only place organization invitation emails are
// sent, so every invite (dashboard, admin, or a future API surface) that goes
// through auth.api.createInvitation gets this for free.
export async function notifyOrganizationInvited(
  env: NotificationEnv,
  db: DbClient,
  opts: OrganizationInvitationInput
) {
  const platformDomain = getPlatformDomain(env)
  const inviteUrl = `https://${platformDomain}/accept-invitation/${opts.invitationId}`

  const rendered = await renderNotificationEmail(organizationInviteMessage({
    organizationName: opts.organizationName,
    inviterName: opts.inviterName,
    role: opts.role,
    inviteUrl,
  }), { platformDomain })

  await sendEmailNotification(env, db, {
    organizationId: opts.organizationId,
    to: opts.email,
    template: 'organization_invited',
    title: `You're invited to join ${opts.organizationName}`,
    payload: {
      invitation_id: opts.invitationId,
      role: opts.role,
      organization_name: opts.organizationName,
      deep_link: inviteUrl,
    },
    email: {
      subject: `You're invited to join ${opts.organizationName} on KrabiClaw`,
      html: rendered.html,
      text: rendered.text,
    },
  })
}

/**
 * Every piece of outbound copy, for /dev/notifications.
 *
 * Email previews come from the single EMAIL_PREVIEWS registry, so a template
 * cannot exist without appearing here — the previous hand-maintained list had
 * silently drifted to covering 14 of 23 templates. WhatsApp copy stays inline
 * because it is approved template text, not a component we render.
 */
export interface CatalogPreviewEntry {
  id: string
  title: string
  audience: 'owner' | 'guest'
  subject: string
  html: string
  text: string
  /** What this event actually sends, for the row that previews it. */
  channels: string[]
  whatsapp: { template: string; text: string } | null
}

/**
 * The catalog, rendered, for /dev/notifications.
 *
 * One entry per event carrying both channels, because the question the page
 * answers is whether they agree — and the WhatsApp side is the approved
 * template's filled slots rather than prose written to stand in for them.
 *
 * The origin comes from the request rather than a constant, so the page shows
 * the assets of the server being looked at. Hardcoding the production domain
 * made every preview load production's images, which cannot show a local
 * change to one.
 */
export async function renderNotificationCatalog(origin: string): Promise<CatalogPreviewEntry[]> {
  const root = origin.trim().replace(/\/$/, '')
  return Promise.all(NOTIFICATION_CATALOG.map(async (entry) => {
    const rendered = await renderNotificationEmail(entry.message, {
      platformDomain: root,
      preferencesUrl: `${root}/dashboard/account/profile/notifications`,
      unsubscribeUrl: entry.message.category === 'account_security'
        ? null
        : `${root}/unsubscribe?user=preview&category=preview&token=preview`,
    })

    let whatsapp: CatalogPreviewEntry['whatsapp'] = null
    if (entry.whatsappTemplate) {
      const { vars } = toWhatsAppVars(entry.message, entry.whatsappTemplate)
      const payload = buildWhatsAppTemplatePayload(entry.whatsappTemplate, vars)
      whatsapp = {
        template: entry.whatsappTemplate,
        text: payload.components
          .flatMap(component => component.parameters.map(parameter => parameter.text))
          .filter(Boolean)
          .join('\n'),
      }
    }

    return {
      id: entry.id,
      title: entry.title,
      audience: entry.audience,
      subject: entry.message.title,
      html: rendered.html,
      text: rendered.text,
      channels: whatsapp ? ['Email', 'WhatsApp'] : ['Email'],
      whatsapp,
    }
  }))
}
