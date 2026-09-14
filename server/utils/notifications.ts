import { formatCalendarDate, formatTime } from '~/utils/timezone'
import { getGuestRequest } from '~/server/domain/requests'
import { renderEmail } from '~/server/emails/vue-email'
import { queryFirst, type DbClient } from '~/server/db'
import { getEmailDeliveryMode, hashEmail, isReservedTestDomain, sendEmail } from '~/server/utils/email-delivery'
import { getOrgWhatsAppPhone, sendWhatsAppNotification, toDashboardButtonPath, type WhatsAppTemplate } from '~/server/utils/whatsapp'
import { getWhatsAppDeliveryMode } from '~/server/utils/whatsapp-delivery'
import { buildReplyToAddress } from '~/server/utils/submission-messages'
import { resolveAuthorizedWhatsAppRecipient, getOrganizationOwnerRecipient } from '~/server/utils/member-access'
import { wantsNotification } from '~/server/domain/notification-preferences'
import { buildUnsubscribeUrl } from '~/server/utils/unsubscribe'
import type { NotificationCategory } from '~/shared/notification-categories'
import GuestThreadOwnerAlert from '~/server/emails/templates/GuestThreadOwnerAlert'
import GuestThreadReply from '~/server/emails/templates/GuestThreadReply'
import GuestThreadStatusUpdate from '~/server/emails/templates/GuestThreadStatusUpdate'
import BookingChangeProposal from '~/server/emails/templates/BookingChangeProposal'
import PlatformArticleAnnouncement from '~/server/emails/templates/PlatformArticleAnnouncement'
import type { CloudflareEnv } from '~/server/utils/auth'
import ReservationOwnerNew from '~/server/emails/templates/ReservationOwnerNew'
import ReservationOwnerCancelled from '~/server/emails/templates/ReservationOwnerCancelled'
import ReservationGuestReceived from '~/server/emails/templates/ReservationGuestReceived'
import ReservationGuestCancelled from '~/server/emails/templates/ReservationGuestCancelled'
import ContactOwnerNew from '~/server/emails/templates/ContactOwnerNew'
import ContactGuestReceived from '~/server/emails/templates/ContactGuestReceived'
import ReviewOwnerNew from '~/server/emails/templates/ReviewOwnerNew'
import BookingOwnerNew from '~/server/emails/templates/BookingOwnerNew'
import BookingGuestReceived from '~/server/emails/templates/BookingGuestReceived'
import BookingOwnerCancelled from '~/server/emails/templates/BookingOwnerCancelled'
import BookingGuestCancelled from '~/server/emails/templates/BookingGuestCancelled'
import BookingChange from '~/server/emails/templates/BookingChange'
import BookingThankYouReviewRequest from '~/server/emails/templates/BookingThankYouReviewRequest'
import BookingReviewReminder from '~/server/emails/templates/BookingReviewReminder'
import OrganizationInvite from '~/server/emails/templates/OrganizationInvite'
import { createCanonicalNotification } from '~/server/utils/notification-center'
import { buildOwnerThreadInboxUrl, getPlatformDomain, resolveSiteLocationSlugs } from '~/server/utils/dashboard-notification-links'
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

interface SiteContext {
  organizationId: string
  siteId: string
  siteName?: string | null
}

interface ReservationNotificationInput extends SiteContext {
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

interface ContactNotificationInput extends SiteContext {
  productTitle?: string | null
  locationId?: string | null
  contactId: string
  guestName: string
  email: string
  subject?: string | null
  message: string
  consentAcknowledged?: boolean
}

interface BookingNotificationInput extends SiteContext {
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

interface ReviewNotificationInput extends SiteContext {
  locationId?: string | null
  reviewId: string
  authorName: string
  rating: number
  content?: string | null
}

interface ReviewRequestNotificationInput extends SiteContext {
  locationId?: string | null
  requestId: string
  bookingType: 'reservation' | 'booking'
  bookingId: string
  kind: 'first' | 'reminder'
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

interface GuestThreadReplyNotificationInput extends SiteContext {
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

export interface NotificationCopyPreview {
  id: string
  audience: 'owner' | 'guest'
  channel: 'email' | 'whatsapp'
  template: string
  title: string
  subject?: string
  html?: string
  text: string
}

function siteName(opts: SiteContext): string {
  const value = opts.siteName?.trim()
  if (!value) throw new Error('Tenant site name is required for notifications')
  return value
}

// The WhatsApp "Reply in dashboard" button URL is declared in the approved Meta
// template as a fixed prefix + single {{1}} variable, so only the path/query
// suffix after that prefix can be sent per-message.
function inboxUrlToWhatsAppReplyPath(inboxUrl: string | null): string {
  return toDashboardButtonPath(inboxUrl ?? undefined, '')
}

function buildReservationWhatsAppContext(locationName?: string | null): string {
  return locationName?.trim() ? `Location: ${locationName.trim()}` : 'Location not provided'
}

function buildExperienceWhatsAppContext(experienceTitle: string, siteName?: string | null): string {
  const business = siteName?.trim()
  if (!business) throw new Error('Tenant site name is required for WhatsApp notifications')
  return `Business: ${business} · Experience: ${experienceTitle}`
}

// Deep-links an owner notification straight to the dashboard inbox thread for that submission.
async function buildOwnerInboxUrl(
  env: NotificationEnv,
  db: DbClient,
  opts: {
    organizationId: string
    siteId: string
    locationId?: string | null
    tab: 'contact' | 'reservations' | 'bookings'
    submissionId: string
  }
): Promise<string | null> {
  const submissionType = opts.tab === 'contact' ? 'contact' : opts.tab === 'reservations' ? 'reservation' : 'booking'
  try {
    const thread = await getGuestRequest(db, opts.submissionId, opts.siteId, submissionType)
    if (!thread) throw new Error('Submission not found')
    await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.created' })
    return await buildOwnerThreadInboxUrl(env, db, {
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      locationId: opts.locationId,
      threadId: thread.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Submission not found')) return null
    throw error instanceof Error ? error : new Error(message)
  }
}

// Deep-links an owner notification straight to the dashboard reviews page for that location,
// optionally scrolling to/highlighting a single review via the `reply` query param.
async function buildOwnerReviewsUrl(
  env: NotificationEnv,
  db: DbClient,
  opts: { organizationId: string; siteId: string; locationId?: string | null; reviewId?: string | null }
): Promise<string | null> {
  const slugs = await resolveSiteLocationSlugs(env, db, opts)
  if (!slugs) return null

  const platformDomain = getPlatformDomain(env)
  const base = `https://${platformDomain}/dashboard/${slugs.orgSlug}/sites/${slugs.siteSlug}/reviews`
  if (!opts.reviewId) return base
  return `${base}?${new URLSearchParams({ reply: opts.reviewId }).toString()}`
}

export interface OwnerEmailRecipient {
  to: string
  userId: string
  unsubscribeUrl: string | null
}

export interface OwnerPhoneRecipient {
  phone: string
  requireSiteWide: boolean
}

/**
 * Who actually receives this alert, on which channel.
 *
 * Replaced the per-site `settings_json.$.config.owner_notification_channels`
 * array. A notification is delivered to a person, so the choice belongs to the
 * person — and the array's unset behaviour picked a channel from whichever data
 * happened to exist (`hasWhatsAppPhone ? ['whatsapp'] : ['email']`), which meant
 * configuring a business number silently switched a tenant's email off.
 *
 * Preference and authorization stay separate: `resolveAuthorizedWhatsAppRecipient`
 * decides whether a number may receive anything at all, and only then is the
 * account behind it asked whether it wants this category.
 */
async function resolveOwnerRecipients(
  env: NotificationEnv,
  db: DbClient,
  opts: {
    organizationId: string
    siteId: string
    locationId?: string | null
    category: NotificationCategory
    candidatePhones: OwnerPhoneRecipient[]
  },
): Promise<{ email: OwnerEmailRecipient | null; phones: OwnerPhoneRecipient[] }> {
  const owner = await getOrganizationOwnerRecipient(env, opts.organizationId)

  const email = owner && await wantsNotification(db, owner.userId, opts.category, 'email')
    ? {
        to: owner.email,
        userId: owner.userId,
        unsubscribeUrl: await buildUnsubscribeUrl(env, { userId: owner.userId, category: opts.category }),
      }
    : null

  const phones: OwnerPhoneRecipient[] = []
  for (const target of opts.candidatePhones) {
    const recipient = await resolveAuthorizedWhatsAppRecipient(db, {
      env,
      phone: target.phone,
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      locationId: opts.locationId ?? null,
      requireSiteWide: target.requireSiteWide,
    })
    if (!recipient) {
      console.error('whatsapp_delivery_blocked', {
        organizationId: opts.organizationId,
        siteId: opts.siteId,
        locationId: opts.locationId ?? null,
        reason: 'recipient_access_pending',
      })
      continue
    }
    if (await wantsNotification(db, recipient.userId, opts.category, 'whatsapp')) phones.push(target)
  }

  return { email, phones }
}

async function sendEmailNotification(
  env: NotificationEnv,
  db: DbClient,
  opts: Omit<SiteContext, 'siteId'> & { siteId: string | null } & {
    locationId?: string | null
    to: string
    replyTo?: string | null
    template: string
    title: string
    payload: Record<string, string>
    email: EmailTemplate
    unsubscribeUrl?: string | null
    delivery?: ThreadDeliveryContext | null
  }
): Promise<boolean> {
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
    return succeeded
  }

  const result = await sendEmail(env, {
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.email.subject,
    html: opts.email.html,
    text: opts.email.text,
    unsubscribeUrl: opts.unsubscribeUrl ?? null,
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
      siteId: opts.siteId,
      template: opts.template,
      recipient: hashEmail(opts.to),
      title: opts.title,
      providerMessageId: result.messageId,
    })
    return true
  }
  console.error('email_delivery_failed', {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    template: opts.template,
    status: result.status,
    error: result.error,
  })
  if (requestWebhookRetry) throw new Error('Email delivery remains eligible for webhook retry')
  return false
}

async function sendWhatsAppThreadNotification(
  env: NotificationEnv,
  db: DbClient,
  opts: {
    organizationId: string
    siteId: string
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
    siteId: string
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

async function getLocationNotificationPhone(db: DbClient, locationId: string, organizationId: string, siteId: string): Promise<string | null> {
  const row = await queryFirst<{ notification_phone: string | null }>(db, `
    SELECT notification_phone FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1
  `, [locationId, organizationId, siteId])
  return row?.notification_phone ?? null
}

async function notifyOwner(
  env: NotificationEnv,
  db: DbClient,
  opts: SiteContext & {
    locationId?: string | null
    template: string
    /** Which preference governs this alert. */
    category: NotificationCategory
    title: string
    payload: Record<string, string>
    email: EmailTemplate
    whatsapp?: {
      template: WhatsAppTemplate
      vars: Record<string, string>
    }
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
  const [, sitePhone, locationPhone] = await Promise.all([
    createCanonicalNotification(db, {
      publishEnv: env,
      scope: 'site',
      template: opts.template,
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      locationId: opts.locationId ?? null,
      sourceEntryId: threadContext?.sourceEntryId ?? null,
      idempotencyKey: threadContext ? `notification:${threadContext.sourceEntryId}:${opts.template}` : undefined,
      title: opts.title,
      deepLink: opts.payload.deep_link || null,
    }),
    getOrgWhatsAppPhone(db, opts.organizationId, opts.siteId),
    opts.locationId ? getLocationNotificationPhone(db, opts.locationId, opts.organizationId, opts.siteId) : null,
  ])

  const configuredTargets = [
    locationPhone ? { phone: locationPhone, requireSiteWide: false } : null,
    sitePhone ? { phone: sitePhone, requireSiteWide: true } : null,
  ].filter(Boolean) as OwnerPhoneRecipient[]
  const targetByPhone = new Map<string, OwnerPhoneRecipient>()
  for (const target of configuredTargets) {
    const existing = targetByPhone.get(target.phone)
    // A number that is both the location's and the site's is reachable at
    // location scope, so the *least* restrictive of the two wins. Taking the
    // most restrictive locked a location-scoped editor out of alerts for their
    // own location whenever the site reused their number.
    targetByPhone.set(target.phone, {
      phone: target.phone,
      requireSiteWide: existing ? existing.requireSiteWide && target.requireSiteWide : target.requireSiteWide,
    })
  }

  // Internal email alerts always go to the org owner/admin account.
  // Public contact emails are guest-facing data and must not double as notification routing.
  const recipients = await resolveOwnerRecipients(env, db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    locationId: opts.locationId ?? null,
    category: opts.category,
    candidatePhones: [...targetByPhone.values()],
  })

  if (recipients.email) {
    const { to, unsubscribeUrl } = recipients.email
    await sendEmailNotification(env, db, {
      ...opts,
      to,
      unsubscribeUrl,
      delivery: threadDelivery(threadContext, 'owner_alert', 'email', opts.template, to),
    })
  }

  if (opts.whatsapp && recipients.phones.length > 0) {
    await Promise.allSettled(recipients.phones.map(async target => {
      const sendOptions = {
        organizationId: opts.organizationId,
        siteId: opts.siteId,
        locationId: opts.locationId ?? null,
        toPhone: target.phone,
        template: opts.whatsapp!.template,
        vars: opts.whatsapp!.vars,
      }
      const delivery = threadDelivery(threadContext, 'owner_alert', 'whatsapp', opts.template, target.phone)
      if (delivery) {
        await sendWhatsAppThreadNotification(env, db, { ...sendOptions, delivery })
      } else {
        await sendWhatsAppNotification(env, sendOptions)
      }
    }))
  }
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
  const restaurant = siteName(opts)
  const prettyDate = formatCalendarDate(opts.date, 'en')
  const prettyTime = formatTime(opts.time, 'en')
  const platformDomain = getPlatformDomain(env)
  const [replyTo, inboxUrl] = await Promise.all([
    buildReplyToAddress(env, 'reservation', opts.reservationId),
    opts.ownerInboxUrl !== undefined
      ? opts.ownerInboxUrl
      : buildOwnerInboxUrl(env, db, {
          organizationId: opts.organizationId,
          siteId: opts.siteId,
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
    site_name: restaurant,
    deep_link: inboxUrl ?? '',
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    renderEmail(ReservationOwnerNew, { guestName: opts.guestName, siteName: restaurant, date: prettyDate, time: prettyTime, guests: opts.guests, phone: opts.phone, email: opts.email, locationName: opts.locationName, specialRequests: opts.requests, platformDomain, replyUrl: inboxUrl }),
    renderEmail(ReservationGuestReceived, { guestName: opts.guestName, siteName: restaurant, date: prettyDate, time: prettyTime, guests: opts.guests, specialRequests: opts.requests, locationName: opts.locationName, contactPhone: opts.contactPhone, contactEmail: opts.contactEmail, cancelUrl: opts.cancelUrl, platformDomain }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'reservation',
      submissionId: opts.reservationId,
      template: 'new_reservation',
      category: 'reservations_bookings',
      title: `New confirmed reservation from ${opts.guestName}`,
      payload,
      email: { subject: `New confirmed reservation from ${opts.guestName}`, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'new_reservation',
        vars: {
          guest_name: opts.guestName,
          date: prettyDate,
          time: prettyTime,
          guests: opts.guests,
          phone: opts.phone ?? '',
          email: opts.email,
          context: buildReservationWhatsAppContext(opts.locationName),
          requests: opts.requests ?? '',
          reply_path: inboxUrlToWhatsAppReplyPath(inboxUrl),
        },
      },
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

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('notifyReservationCreated_failed', {
        task: index === 0 ? 'notifyOwner' : 'sendEmailNotification',
        reservationId: opts.reservationId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason)
      })
    }
  })
}

export async function notifyReservationCancelled(
  env: NotificationEnv,
  db: DbClient,
  opts: ReservationNotificationInput
) {
  const confirmed = Boolean(opts.wasConfirmed)
  const restaurant = siteName(opts)
  const prettyDate = formatCalendarDate(opts.date, 'en')
  const prettyTime = formatTime(opts.time, 'en')
  const platformDomain = getPlatformDomain(env)
  const inboxUrl = await buildOwnerInboxUrl(env, db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    locationId: opts.locationId,
    tab: 'reservations',
    submissionId: opts.reservationId,
  })
  const ownerCancelTitle = confirmed
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
    site_name: restaurant,
    deep_link: inboxUrl ?? '',
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    renderEmail(ReservationOwnerCancelled, { guestName: opts.guestName, siteName: restaurant, date: prettyDate, time: prettyTime, guests: opts.guests, phone: opts.phone, email: opts.email, locationName: opts.locationName, specialRequests: opts.requests, wasConfirmed: confirmed, platformDomain, replyUrl: inboxUrl }),
    renderEmail(ReservationGuestCancelled, { guestName: opts.guestName, siteName: restaurant, date: prettyDate, time: prettyTime, guests: opts.guests, locationName: opts.locationName, specialRequests: opts.requests, wasConfirmed: confirmed, platformDomain }),
  ])
  const threadContext = await recordGuestCancellation(db, {
    submissionType: 'reservation',
    submissionId: opts.reservationId,
    organizationId: opts.organizationId,
    siteId: opts.siteId,
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
      category: 'reservations_bookings',
      title: ownerCancelTitle,
      payload,
      email: { subject: ownerCancelTitle, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'reservation_cancelled',
        vars: {
          guest_name: opts.guestName,
          date: prettyDate,
          time: prettyTime,
          guests: opts.guests,
          phone: opts.phone ?? '',
          context: buildReservationWhatsAppContext(opts.locationName),
          requests: opts.requests ?? '',
          reply_path: inboxUrlToWhatsAppReplyPath(inboxUrl),
        },
      },
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

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('notifyReservationCancelled_failed', {
        task: index === 0 ? 'notifyOwner' : 'sendEmailNotification',
        reservationId: opts.reservationId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason)
      })
    }
  })
}

export async function notifyContactSubmitted(
  env: NotificationEnv,
  db: DbClient,
  opts: ContactNotificationInput
) {
  const restaurant = siteName(opts)
  const platformDomain = getPlatformDomain(env)
  const replyTo = await buildReplyToAddress(env, 'contact', opts.contactId)
  const inboxUrl = await buildOwnerInboxUrl(env, db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
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
    site_name: restaurant,
    experience_title: opts.productTitle ?? '',
    consent_acknowledged: opts.consentAcknowledged === true ? 'true' : 'false',
    deep_link: inboxUrl ?? '',
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    renderEmail(ContactOwnerNew, { guestName: opts.guestName, email: opts.email, subject: opts.subject, message: opts.message, siteName: restaurant, platformDomain, replyUrl: inboxUrl, productTitle: opts.productTitle, consentAcknowledged: opts.consentAcknowledged }),
    renderEmail(ContactGuestReceived, { guestName: opts.guestName, siteName: restaurant, subject: opts.subject, message: opts.message, platformDomain, productTitle: opts.productTitle, consentAcknowledged: opts.consentAcknowledged }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'contact',
      submissionId: opts.contactId,
      template: 'new_contact_msg',
      category: 'guest_messages',
      title: `New website message from ${opts.guestName}`,
      payload,
      email: { subject: `New website message from ${opts.guestName}`, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'new_contact_msg',
        vars: {
          guest_name: opts.guestName,
          email: opts.email,
          subject: opts.subject ? SUBJECT_LABELS[opts.subject] ?? opts.subject : '',
          message_preview: opts.consentAcknowledged ? `${opts.message}\n\nContact/privacy notice acknowledged.` : opts.message,
          reply_path: inboxUrlToWhatsAppReplyPath(inboxUrl),
        },
      },
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

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('notifyContactSubmitted_failed', {
        task: index === 0 ? 'notifyOwner' : 'sendEmailNotification',
        contactId: opts.contactId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason)
      })
    }
  })

}

export async function notifyReviewReceived(
  env: NotificationEnv,
  db: DbClient,
  opts: ReviewNotificationInput
) {
  const restaurant = siteName(opts)
  const platformDomain = getPlatformDomain(env)
  const reviewsUrl = await buildOwnerReviewsUrl(env, db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    locationId: opts.locationId,
    reviewId: opts.reviewId,
  })

  try {
    const ownerEmail = await renderEmail(ReviewOwnerNew, {
      authorName: opts.authorName,
      rating: opts.rating,
      content: opts.content ?? '',
      siteName: restaurant,
      platformDomain,
      reviewsUrl,
    })

    await notifyOwner(env, db, {
      ...opts,
      template: 'new_review',
      category: 'reviews',
      title: `New ${opts.rating}-star review from ${opts.authorName}`,
      payload: {
        review_id: opts.reviewId,
        author_name: opts.authorName,
        rating: String(opts.rating),
        content_preview: (opts.content ?? '').slice(0, 200),
        site_name: restaurant,
        deep_link: reviewsUrl ?? '',
      },
      email: { subject: `New review from ${opts.authorName}`, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'new_review',
        vars: { rating: String(opts.rating), site_name: restaurant, excerpt: opts.content ?? '', reviews_url: reviewsUrl ?? '' },
      },
    })
  } catch (error) {
    console.error('notifyReviewReceived_failed', {
      reviewId: opts.reviewId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export async function notifyReviewRequest(
  env: NotificationEnv,
  db: DbClient,
  opts: ReviewRequestNotificationInput
): Promise<boolean> {
  const restaurant = siteName(opts)
  const platformDomain = getPlatformDomain(env)
  const templateComponent = opts.kind === 'reminder' ? BookingReviewReminder : BookingThankYouReviewRequest
  const templateName = opts.kind === 'reminder' ? 'booking_review_reminder' : 'booking_thank_you_review_request'
  const title = opts.kind === 'reminder'
    ? `Review reminder for ${opts.bookingPhrase}`
    : `Review request for ${opts.bookingPhrase}`

  const email = await renderEmail(templateComponent, {
    guestName: opts.guestName,
    siteName: restaurant,
    locationName: opts.locationName ?? null,
    // Only the thank-you headline asks "How was <phrase>?"; the reminder
    // headline names the business, so it does not take the phrase at all.
    ...(opts.kind === 'reminder' ? {} : { bookingPhrase: opts.bookingPhrase }),
    visitAt: opts.visitAt,
    partySize: opts.partySize,
    reviewUrl: opts.reviewUrl,
    optOutUrl: opts.optOutUrl,
    platformDomain,
  })

  return await sendEmailNotification(env, db, {
    ...opts,
    to: opts.email,
    template: templateName,
    title,
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
      site_name: restaurant,
    },
    email: {
      subject: opts.kind === 'reminder'
        ? `Reminder: review ${restaurant}`
        : `How was your visit to ${restaurant}?`,
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
  const studio = siteName(opts)
  const prettyDate = new Intl.DateTimeFormat('en-US', { timeZone: opts.timezone, dateStyle: 'medium' }).format(new Date(opts.startsAt))
  const prettyTime = new Intl.DateTimeFormat('en-US', { timeZone: opts.timezone, timeStyle: 'short' }).format(new Date(opts.startsAt))
  const platformDomain = getPlatformDomain(env)
  const [replyTo, inboxUrl] = await Promise.all([
    buildReplyToAddress(env, 'booking', opts.bookingId),
    opts.ownerInboxUrl !== undefined
      ? opts.ownerInboxUrl
      : buildOwnerInboxUrl(env, db, {
          organizationId: opts.organizationId,
          siteId: opts.siteId,
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
    site_name: studio,
    deep_link: inboxUrl ?? '',
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    renderEmail(BookingOwnerNew, { guestName: opts.guestName, siteName: studio, productTitle: opts.productTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, email: opts.email, phone: opts.guestPhone ?? null, specialRequests: opts.notes, platformDomain, replyUrl: inboxUrl }),
    renderEmail(BookingGuestReceived, { guestName: opts.guestName, siteName: studio, productTitle: opts.productTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, specialRequests: opts.notes, contactPhone: opts.contactPhone ?? null, contactEmail: opts.contactEmail ?? null, cancelUrl: opts.cancelUrl ?? null, platformDomain }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'booking',
      submissionId: opts.bookingId,
      template: 'new_reservation',
      category: 'reservations_bookings',
      title: `New booking request from ${opts.guestName}`,
      payload,
      email: { subject: `New booking request from ${opts.guestName}`, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'new_reservation',
        vars: {
          guest_name: opts.guestName,
          date: prettyDate,
          time: prettyTime,
          guests: String(opts.partySize),
          phone: opts.guestPhone ?? '',
          email: opts.email,
          context: buildExperienceWhatsAppContext(opts.productTitle, opts.siteName),
          requests: opts.notes ?? '',
          reply_path: inboxUrlToWhatsAppReplyPath(inboxUrl),
        },
      },
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

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('notifyBookingCreated_failed', {
        task: index === 0 ? 'notifyOwner' : 'sendEmailNotification',
        bookingId: opts.bookingId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  })
}

export async function notifyBookingCancelled(
  env: NotificationEnv,
  db: DbClient,
  opts: BookingNotificationInput
) {
  const confirmed = Boolean(opts.wasConfirmed)
  const studio = siteName(opts)
  const prettyDate = new Intl.DateTimeFormat('en-US', { timeZone: opts.timezone, dateStyle: 'medium' }).format(new Date(opts.startsAt))
  const prettyTime = new Intl.DateTimeFormat('en-US', { timeZone: opts.timezone, timeStyle: 'short' }).format(new Date(opts.startsAt))
  const platformDomain = getPlatformDomain(env)
  const inboxUrl = await buildOwnerInboxUrl(env, db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    locationId: opts.locationId,
    tab: 'bookings',
    submissionId: opts.bookingId,
  })
  const ownerCancelTitle = confirmed
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
    site_name: studio,
    deep_link: inboxUrl ?? '',
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    renderEmail(BookingOwnerCancelled, { guestName: opts.guestName, siteName: studio, productTitle: opts.productTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, email: opts.email, phone: opts.guestPhone, notes: opts.notes, wasConfirmed: confirmed, platformDomain, replyUrl: inboxUrl }),
    renderEmail(BookingGuestCancelled, { guestName: opts.guestName, siteName: studio, productTitle: opts.productTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, notes: opts.notes, wasConfirmed: confirmed, platformDomain }),
  ])
  const threadContext = await recordGuestCancellation(db, {
    submissionType: 'booking',
    submissionId: opts.bookingId,
    organizationId: opts.organizationId,
    siteId: opts.siteId,
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
      category: 'reservations_bookings',
      title: ownerCancelTitle,
      payload,
      email: { subject: ownerCancelTitle, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'reservation_cancelled',
        vars: {
          guest_name: opts.guestName,
          date: prettyDate,
          time: prettyTime,
          guests: String(opts.partySize),
          phone: opts.guestPhone ?? '',
          context: buildExperienceWhatsAppContext(opts.productTitle, opts.siteName),
          requests: opts.notes ?? '',
          reply_path: inboxUrlToWhatsAppReplyPath(inboxUrl),
        },
      },
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

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('notifyBookingCancelled_failed', {
        task: index === 0 ? 'notifyOwner' : 'sendEmailNotification',
        bookingId: opts.bookingId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  })
}

/** Notify the tenant through the same dashboard/email/WhatsApp path as other booking events. */
export async function notifyBookingChangeOwner(
  env: NotificationEnv,
  db: DbClient,
  opts: SiteContext & {
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
  const body = `${message}\n\nRequested location: ${opts.locationTitle}\nWhen: ${opts.whenLabel}\nGuests: ${opts.guests}`
  const replyUrl = await buildOwnerThreadInboxUrl(env, db, opts)
  const email = await renderEmail(BookingChange, {
    title,
    body,
    siteName: siteName(opts),
    platformDomain: getPlatformDomain(env),
    actionUrl: replyUrl ?? undefined,
    actionLabel: 'View in dashboard',
  })
  await notifyOwner(env, db, {
    ...opts,
    template: `${noun}.change_${opts.status}`,
    category: 'reservations_bookings',
    title,
    payload: {
      request_id: opts.threadId,
      submission_type: opts.submissionType,
      submission_id: opts.submissionId,
      status: opts.status,
      deep_link: replyUrl ?? '',
    },
    notificationSource: { threadId: opts.threadId, entryId: opts.sourceEntryId },
    email: { subject: title, ...email },
    whatsapp: {
      template: 'booking_change_update',
      vars: {
        booking_type: noun,
        guest_name: opts.guestName,
        status: opts.status,
        location: opts.locationTitle,
        when: opts.whenLabel,
        guests: String(opts.guests),
        message,
        reply_path: inboxUrlToWhatsAppReplyPath(replyUrl),
      },
    },
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
    siteId: opts.siteId,
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
    scope: 'site',
    template,
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    locationId: opts.locationId ?? null,
    sourceEntryId: opts.sourceEntryId,
    title,
    deepLink: payload.deep_link || null,
  })

  const sitePhone = await getOrgWhatsAppPhone(db, opts.organizationId, opts.siteId)
  const locationPhone = opts.locationId ? await getLocationNotificationPhone(db, opts.locationId, opts.organizationId, opts.siteId) : null
  const candidatePhones: OwnerPhoneRecipient[] = [
    locationPhone ? { phone: locationPhone, requireSiteWide: false } : null,
    sitePhone && sitePhone !== locationPhone ? { phone: sitePhone, requireSiteWide: true } : null,
  ].filter(Boolean) as OwnerPhoneRecipient[]

  const recipients = await resolveOwnerRecipients(env, db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    locationId: opts.locationId ?? null,
    category: 'guest_messages',
    candidatePhones,
  })

  const emailResults = recipients.email
    ? await Promise.allSettled([sendEmailNotification(env, db, {
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      siteName: opts.siteName ?? null,
      locationId: opts.locationId ?? null,
      to: recipients.email.to,
      template: 'guest_thread_reply_email',
      title,
      payload,
      email: {
        subject: `New guest reply from ${sanitizeEmailHeaderValue(opts.guestName)}`,
        ...(await renderEmail(GuestThreadOwnerAlert, {
          guestName: opts.guestName,
          inboundChannel: opts.inboundChannel,
          messagePreview: opts.messagePreview,
          replyUrl,
          siteName: opts.siteName ?? null,
          unsubscribeUrl: recipients.email.unsubscribeUrl,
          platformDomain: getPlatformDomain(env),
        })),
      },
      unsubscribeUrl: recipients.email.unsubscribeUrl,
      delivery: threadDelivery(threadContext, 'owner_alert', 'email', 'guest_thread_reply_email', recipients.email.to),
    })])
    : []

  if (recipients.phones.length > 0) {
    await Promise.allSettled(recipients.phones.map(async ({ phone: toPhone }) => {
      const delivery = threadDelivery(threadContext, 'owner_alert', 'whatsapp', 'guest_thread_reply_whatsapp', toPhone)
      if (!delivery) throw new Error('Guest reply delivery context is missing')
      await sendWhatsAppThreadNotification(env, db, {
        organizationId: opts.organizationId,
        siteId: opts.siteId,
        locationId: opts.locationId ?? null,
        toPhone,
        template: 'guest_thread_reply_whatsapp',
        vars: {
          guest_name: opts.guestName,
          email: opts.guestEmail ?? 'No email provided',
          subject: opts.inboundChannel === 'whatsapp' ? 'WhatsApp reply' : 'Email reply',
          message_preview: opts.messagePreview,
          reply_path: inboxUrlToWhatsAppReplyPath(replyUrl),
        },
        delivery,
      })
    }))
  }

  if (emailResults.some(result => result.status === 'rejected')) {
    throw new Error('Guest thread owner email notification was not delivered')
  }

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

  const rendered = await renderEmail(OrganizationInvite, {
    organizationName: opts.organizationName,
    inviterName: opts.inviterName,
    role: opts.role,
    inviteUrl,
    platformDomain,
  })

  await sendEmailNotification(env, db, {
    organizationId: opts.organizationId,
    siteId: null,
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

export async function getNotificationCopyPreviews(): Promise<NotificationCopyPreview[]> {
  const restaurant = 'Ember & Slice'
  const studio = 'Pottery House Krabi'
  const platformDomain = 'krabiclaw.com'

  const [
    ownerReservation,
    guestReservationReceived,
    guestReservationCancelled,
    ownerReservationCancelled,
    ownerContact,
    guestContact,
    ownerBooking,
    guestBooking,
    organizationInvite,
    guestThreadReply,
    guestThreadStatusUpdate,
    guestThreadOwnerAlert,
    bookingChangeProposal,
    articleAnnouncement,
  ] = await Promise.all([
    renderEmail(ReservationOwnerNew, { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', phone: '+1 555 123 4567', email: 'alex@example.com', platformDomain, replyUrl: 'https://demo.krabiclaw.com/dashboard/ember-slice/sites/ember-slice/locations/main/inbox/res-preview-1' }),
    renderEmail(ReservationGuestReceived, { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', contactPhone: '+1 555 000 0000', contactEmail: 'hello@emberslice.example', cancelUrl: 'https://demo.krabiclaw.com/reservations/cancel?id=res-preview-1', platformDomain }),
    renderEmail(ReservationGuestCancelled, { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', locationName: 'Main Dining Room', specialRequests: 'Window seat', wasConfirmed: false, platformDomain }),
    renderEmail(ReservationOwnerCancelled, { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', phone: '+1 555 123 4567', email: 'alex@example.com', locationName: 'Main Dining Room', specialRequests: 'Window seat', wasConfirmed: false, platformDomain }),
    renderEmail(ContactOwnerNew, { guestName: 'Jordan Lee', email: 'jordan@example.com', message: 'Hi, do you have vegan options and parking nearby?', siteName: restaurant, platformDomain, replyUrl: 'https://demo.krabiclaw.com/dashboard/ember-slice/sites/ember-slice/inbox/contact-preview-1', consentAcknowledged: true }),
    renderEmail(ContactGuestReceived, { guestName: 'Jordan Lee', siteName: restaurant, subject: 'general', message: 'Hi, do you have vegan options and parking nearby?', platformDomain, consentAcknowledged: true }),
    renderEmail(BookingOwnerNew, { guestName: 'Mina Park', siteName: studio, productTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM', partySize: 2, email: 'mina@example.com', phone: '+66 76 000 0002', platformDomain, replyUrl: 'https://demo.krabiclaw.com/dashboard/pottery-house-krabi/sites/pottery-house/locations/main/inbox/booking-preview-1' }),
    renderEmail(BookingGuestReceived, { guestName: 'Mina Park', siteName: studio, productTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM', partySize: 2, contactPhone: '+66 76 000 0001', contactEmail: 'hello@example.com', cancelUrl: 'https://demo.krabiclaw.com/bookings/cancel?id=booking-preview-1', platformDomain }),
    renderEmail(OrganizationInvite, { organizationName: studio, inviterName: 'Priya Shah', role: 'admin', inviteUrl: 'https://demo.krabiclaw.com/accept-invitation/invite-preview-1', platformDomain }),
    renderEmail(GuestThreadReply, { siteName: restaurant, body: 'Hi Jordan,\n\nYes — we have a full vegan menu, and there is street parking on Soi 3 right outside. See you Tuesday!', platformDomain }),
    renderEmail(GuestThreadStatusUpdate, { siteName: restaurant, heading: `Your reservation at ${restaurant} is confirmed`, body: 'Your reservation is confirmed: Tue, Jul 14, 2026 at 7:00 PM for 2 guests.', actionUrl: 'https://demo.krabiclaw.com/reservations/cancel?id=res-preview-1', actionText: 'Manage your reservation', platformDomain }),
    renderEmail(GuestThreadOwnerAlert, { guestName: 'Jordan Lee', inboundChannel: 'email', messagePreview: 'Thanks! One more thing — is the terrace covered if it rains?', replyUrl: 'https://demo.krabiclaw.com/dashboard/ember-slice/sites/ember-slice/inbox/contact-preview-1', siteName: restaurant, unsubscribeUrl: 'https://krabiclaw.com/unsubscribe?user=preview&category=guest_messages&token=preview', platformDomain }),
    renderEmail(BookingChangeProposal, { guestName: 'Mina Park', siteName: studio, heading: 'Please review changes to your booking', intro: 'Hi Mina, your host has requested changes to your booking. It stays exactly as it is until you accept, and the link below expires in 7 days.', rows: [['Location', 'Main Studio'], ['When', 'Tue, Jul 21, 2026 at 2:00 PM'], ['Guests', '2']], actionUrl: 'https://demo.krabiclaw.com/booking-changes/booking-preview-1/entry-preview-1', actionText: 'Review the changes', platformDomain }),
    renderEmail(PlatformArticleAnnouncement, { title: 'Turning walk-ins into repeat guests', summary: 'Three things the best-performing KrabiClaw sites do after a guest leaves.', coverImageUrl: null, articleUrl: 'https://krabiclaw.com/blog/operations/turning-walk-ins-into-repeat-guests', unsubscribeUrl: 'https://krabiclaw.com/unsubscribe?user=preview&category=product_news&token=preview', platformDomain }),
  ])

  return [
    {
      id: 'guest-thread-reply-email',
      audience: 'guest',
      channel: 'email',
      template: 'guest_thread_member_reply',
      title: 'Guest — a reply from the business',
      subject: `Re: your message to ${restaurant}`,
      html: guestThreadReply.html,
      text: guestThreadReply.text,
    },
    {
      id: 'guest-thread-status-update-email',
      audience: 'guest',
      channel: 'email',
      template: 'guest_thread_status_update',
      title: 'Guest — reservation status changed',
      subject: `Your reservation at ${restaurant} is confirmed`,
      html: guestThreadStatusUpdate.html,
      text: guestThreadStatusUpdate.text,
    },
    {
      id: 'owner-guest-thread-reply-email',
      audience: 'owner',
      channel: 'email',
      template: 'guest_thread_reply_email',
      title: 'Owner alert — guest replied',
      subject: 'New guest reply from Jordan Lee',
      html: guestThreadOwnerAlert.html,
      text: guestThreadOwnerAlert.text,
    },
    {
      id: 'guest-booking-change-proposal-email',
      audience: 'guest',
      channel: 'email',
      template: 'booking.change_requested',
      title: 'Guest — booking change proposed',
      subject: 'Please review changes to your booking',
      html: bookingChangeProposal.html,
      text: bookingChangeProposal.text,
    },
    {
      id: 'owner-article-announcement-email',
      audience: 'owner',
      channel: 'email',
      template: 'platform_article_announcement',
      title: 'KrabiClaw news — new article published',
      subject: 'Turning walk-ins into repeat guests',
      html: articleAnnouncement.html,
      text: articleAnnouncement.text,
    },
    {
      id: 'owner-new-reservation-email',
      audience: 'owner',
      channel: 'email',
      template: 'new_reservation',
      title: 'Owner alert — new reservation',
      subject: 'New confirmed reservation from Alex Carter',
      html: ownerReservation.html,
      text: ownerReservation.text,
    },
    {
      id: 'guest-reservation-received-email',
      audience: 'guest',
      channel: 'email',
      template: 'reservation_customer_received',
      title: 'Guest confirmation — reservation confirmed',
      subject: 'Your reservation is confirmed',
      html: guestReservationReceived.html,
      text: guestReservationReceived.text,
    },
    {
      id: 'guest-reservation-cancelled-email',
      audience: 'guest',
      channel: 'email',
      template: 'reservation_customer_cancelled',
      title: 'Guest confirmation — reservation request cancelled',
      subject: 'Your reservation request was cancelled',
      html: guestReservationCancelled.html,
      text: guestReservationCancelled.text,
    },
    {
      id: 'owner-reservation-cancelled-email',
      audience: 'owner',
      channel: 'email',
      template: 'reservation_cancelled',
      title: 'Owner alert — reservation cancelled',
      subject: 'Reservation request cancelled by Alex Carter',
      html: ownerReservationCancelled.html,
      text: ownerReservationCancelled.text,
    },
    {
      id: 'owner-new-contact-email',
      audience: 'owner',
      channel: 'email',
      template: 'new_contact_msg',
      title: 'Owner alert — new contact message',
      subject: 'New website message from Jordan Lee',
      html: ownerContact.html,
      text: ownerContact.text,
    },
    {
      id: 'guest-contact-received-email',
      audience: 'guest',
      channel: 'email',
      template: 'contact_customer_received',
      title: 'Guest confirmation — message sent',
      subject: 'Your message was sent',
      html: guestContact.html,
      text: guestContact.text,
    },
    {
      id: 'owner-new-experience-booking-email',
      audience: 'owner',
      channel: 'email',
      template: 'new_reservation',
      title: 'Owner alert — new experience booking',
      subject: 'New booking request from Mina Park',
      html: ownerBooking.html,
      text: ownerBooking.text,
    },
    {
      id: 'guest-experience-booking-received-email',
      audience: 'guest',
      channel: 'email',
      template: 'booking_customer_received',
      title: 'Guest confirmation — experience booking request sent',
      subject: 'Your booking request was sent — Pottery Wheel Class',
      html: guestBooking.html,
      text: guestBooking.text,
    },
    {
      id: 'owner-new-contact-whatsapp',
      audience: 'owner',
      channel: 'whatsapp',
      template: 'new_contact_msg',
      title: 'Owner WhatsApp — new contact message',
      text: 'New website message from Jordan Lee: "Hi, do you have vegan options and parking nearby?" Reply: jordan@example.com',
    },
    {
      id: 'owner-new-reservation-whatsapp',
      audience: 'owner',
      channel: 'whatsapp',
      template: 'new_reservation',
      title: 'Owner WhatsApp — new reservation',
      text: 'New confirmed reservation: Alex Carter, Tue, Jul 14, 2026 at 7:00 PM, 2 guests. Phone: +1 555 123 4567. Email: alex@example.com. Location: Main Dining Room. Special requests: Window seat.',
    },
    {
      id: 'owner-reservation-cancelled-whatsapp',
      audience: 'owner',
      channel: 'whatsapp',
      template: 'reservation_cancelled',
      title: 'Owner WhatsApp — reservation cancelled',
      text: 'Reservation cancelled: Alex Carter, Tue, Jul 14, 2026 at 7:00 PM, 2 guests. Phone: +1 555 123 4567. Location: Main Dining Room.',
    },
    {
      id: 'owner-new-experience-booking-whatsapp',
      audience: 'owner',
      channel: 'whatsapp',
      template: 'new_reservation',
      title: 'Owner WhatsApp — new experience booking',
      text: 'New booking request: Mina Park, Mon, Jul 20, 2026 at 10:00 AM, 2 guests. Phone: +66 76 000 0002. Email: mina@example.com. Business: Pottery House Krabi · Experience: Pottery Wheel Class. Special requests: None.',
    },
    {
      id: 'owner-experience-booking-cancelled-whatsapp',
      audience: 'owner',
      channel: 'whatsapp',
      template: 'reservation_cancelled',
      title: 'Owner WhatsApp — experience booking cancelled',
      text: 'Booking cancelled: Mina Park, Mon, Jul 20, 2026 at 10:00 AM, 2 guests. Phone: +66 76 000 0002. Business: Pottery House Krabi · Experience: Pottery Wheel Class.',
    },
    {
      id: 'organization-invite-email',
      audience: 'guest',
      channel: 'email',
      template: 'organization_invited',
      title: 'Invitee — organization invitation',
      subject: `You're invited to join ${studio} on KrabiClaw`,
      html: organizationInvite.html,
      text: organizationInvite.text,
    },
  ]
}
