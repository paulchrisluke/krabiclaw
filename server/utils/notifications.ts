import { renderEmail } from '~/server/emails/vue-email'
import { queryFirst, type DbClient } from '~/server/db'
import { getEmailDeliveryMode, hashEmail, isReservedTestDomain, sendEmail } from '~/server/utils/email-delivery'
import { getOrgWhatsAppPhone, sendWhatsAppNotification, toDashboardButtonPath, type WhatsAppTemplate } from '~/server/utils/whatsapp'
import { getWhatsAppDeliveryMode } from '~/server/utils/whatsapp-delivery'
import { buildReplyToAddress } from '~/server/utils/submission-messages'
import { isAuthorizedWhatsAppRecipient, getOrganizationOwnerEmail  } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'
import { getPlatformSupportEmails } from '~/server/utils/platform-support'
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
import BookingThankYouReviewRequest from '~/server/emails/templates/BookingThankYouReviewRequest'
import BookingReviewReminder from '~/server/emails/templates/BookingReviewReminder'
import OrganizationInvite from '~/server/emails/templates/OrganizationInvite'
import { createCanonicalNotification } from '~/server/utils/notification-center'
import { buildOwnerThreadInboxUrl, getPlatformDomain, resolveSiteLocationSlugs } from '~/server/utils/dashboard-notification-links'
import { createDeliveryReceipt, recordDeliveryOutcome } from '~/server/domain/guest-threads/deliveries'
import { appendEntry, findEntryByDedupeKey } from '~/server/domain/guest-threads/entries'
import { getGuestThreadBySubmission } from '~/server/domain/guest-threads/repository'
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
  PLATFORM_OWNER_EMAILS?: string
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
  phone: string
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
  locationId?: string | null
  contactId: string
  guestName: string
  email: string
  subject?: string | null
  message: string
  consentAcknowledged?: boolean
  experienceId?: string | null
  experienceTitle?: string | null
}

interface PlatformContactNotificationInput {
  contactId: string
  guestName: string
  email: string
  subject?: string | null
  message: string
  source?: string | null
  routeContext?: string | null
  suggestedSummary?: string | null
}

interface ExperienceBookingNotificationInput extends SiteContext {
  locationId?: string | null
  bookingId: string
  guestName: string
  email: string
  guestPhone?: string | null
  experienceTitle: string
  bookingDate: string
  timeSlot: string
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
  bookingType: 'reservation' | 'experience_booking'
  bookingId: string
  kind: 'first' | 'reminder'
  guestName: string
  email: string
  locationName?: string | null
  bookingLabel: string
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
  submissionType: 'contact' | 'reservation' | 'experience_booking'
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

function formatDateHuman(dateValue: string): string {
  const value = String(dateValue || '').trim()
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!isoMatch) return value
  const [, y, m, d] = isoMatch
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt)
}

function formatTimeHuman(timeValue: string): string {
  const value = String(timeValue || '').trim()
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return value
  const h = Number(match[1])
  const m = Number(match[2])
  if (Number.isNaN(h) || Number.isNaN(m)) return value
  const dt = new Date(Date.UTC(2000, 0, 1, h, m))
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(dt)
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
  const submissionType = opts.tab === 'contact' ? 'contact' : opts.tab === 'reservations' ? 'reservation' : 'experience_booking'
  try {
    // Deferred import: the reservation/experience-booking adapters pull in mcp-workflows.ts
    // and experiences.ts, whose own dependency graphs import this file —
    // a static top-level import here would be a circular import.
    const [{ ensureGuestThread }, { getAdapter }] = await Promise.all([
      import('~/server/domain/guest-threads/repository'),
      import('~/server/domain/guest-threads/adapters/registry'),
    ])
    const thread = await ensureGuestThread(db, getAdapter(submissionType), opts.submissionId, { publishEnv: env })
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

async function getOwnerNotificationChannels(
  db: DbClient,
  opts: SiteContext,
  hasWhatsAppPhone: boolean
): Promise<NotificationChannel[]> {
  const row = await queryFirst<{ value?: string }>(db, `
    SELECT value FROM site_config
    WHERE organization_id = ? AND site_id = ? AND key = 'owner_notification_channels'
    LIMIT 1
  `, [opts.organizationId, opts.siteId])

  if (!row?.value) return hasWhatsAppPhone ? ['whatsapp'] : ['email']

  const parsedChannels: unknown = JSON.parse(row.value)
  if (!Array.isArray(parsedChannels) || !parsedChannels.every(channel => typeof channel === 'string')) {
    throw new Error('Stored owner notification channels are invalid')
  }
  const rawChannels = parsedChannels

  const channels = rawChannels
    .map(channel => channel.trim().toLowerCase())
    .filter((channel): channel is NotificationChannel => channel === 'email' || channel === 'whatsapp')

  const uniqueChannels = [...new Set(channels)]
  return uniqueChannels
}

export async function insertDashboardNotification(
  env: NotificationEnv,
  db: DbClient,
  opts: Omit<SiteContext, 'siteId'> & { siteId: string | null } & {
    locationId?: string | null
    template: string
    title: string
    payload: Record<string, string>
    guestThreadId?: string | null
    sourceEntryId?: string | null
  }
): Promise<void> {
  await createCanonicalNotification(db, {
    publishEnv: env,
    scope: 'site',
    template: opts.template,
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    locationId: opts.locationId ?? null,
    sourceEntryId: opts.sourceEntryId ?? null,
    title: opts.title,
    deepLink: opts.payload.deep_link || null,
  })
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
  if (delivery && delivery.status !== 'pending') {
    return delivery.status === 'sent' || delivery.status === 'delivered' || delivery.status === 'read'
  }

  const result = await sendEmail(env, {
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.email.subject,
    html: opts.email.html,
    text: opts.email.text,
    idempotencyKey: delivery?.id,
  })
  if (delivery && deliveryContext) {
    await recordDeliveryOutcome(db, {
      deliveryId: delivery.id,
      status: result.status,
      providerMessageId: result.status === 'sent' ? result.messageId : null,
      error: result.status === 'sent' ? null : result.error,
    })
    await publishGuestInboxThreadEvent(env, db, { threadId: deliveryContext.threadId, type: 'delivery.changed' })
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
  if (delivery.status !== 'pending') {
    return delivery.status === 'sent' || delivery.status === 'delivered' || delivery.status === 'read'
  }

  try {
    const result = await sendWhatsAppNotification(env, db, opts)
    await recordDeliveryOutcome(db, {
      deliveryId: delivery.id,
      status: result.status,
      providerMessageId: result.success ? result.messageId ?? null : null,
      error: result.success ? null : result.error,
    })
    await publishGuestInboxThreadEvent(env, db, { threadId: opts.delivery.threadId, type: 'delivery.changed' })
    return result.success
  } catch (error) {
    await recordDeliveryOutcome(db, {
      deliveryId: delivery.id,
      status: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    })
    await publishGuestInboxThreadEvent(env, db, { threadId: opts.delivery.threadId, type: 'delivery.changed' })
    throw error
  }
}

async function getOpeningThreadContext(
  db: DbClient,
  submissionType: 'contact' | 'reservation' | 'experience_booking',
  submissionId: string,
): Promise<{ guestThreadId: string; sourceEntryId: string } | null> {
  const thread = await getGuestThreadBySubmission(db, submissionType, submissionId)
  if (!thread) return null
  const entry = await findEntryByDedupeKey(db, `submission:${submissionType}:${submissionId}`)
  if (!entry) return null
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
    submissionType: 'reservation' | 'experience_booking'
    submissionId: string
    organizationId: string
    siteId: string
    subject: string
    body: string
    wasConfirmed: boolean
  },
): Promise<{ guestThreadId: string; sourceEntryId: string } | null> {
  const thread = await getGuestThreadBySubmission(db, input.submissionType, input.submissionId)
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
    title: string
    payload: Record<string, string>
    email: EmailTemplate
    whatsapp?: {
      template: WhatsAppTemplate
      vars: Record<string, string>
    }
    submissionType?: 'contact' | 'reservation' | 'experience_booking' | 'invitation' | null
    submissionId?: string | null
  }
) {
  const threadContext = opts.submissionType && opts.submissionType !== 'invitation' && opts.submissionId
    ? await getOpeningThreadContext(db, opts.submissionType, opts.submissionId)
    : null
  const [, sitePhone, locationPhone, ownerEmail] = await Promise.all([
    insertDashboardNotification(env, db, { ...opts, ...threadContext }),
    getOrgWhatsAppPhone(db, opts.organizationId, opts.siteId),
    opts.locationId ? getLocationNotificationPhone(db, opts.locationId, opts.organizationId, opts.siteId) : null,
    getOrganizationOwnerEmail(env, opts.organizationId),
  ])

  const configuredTargets = [
    locationPhone ? { phone: locationPhone, requireSiteWide: false } : null,
    sitePhone ? { phone: sitePhone, requireSiteWide: true } : null,
  ].filter(Boolean) as Array<{ phone: string; requireSiteWide: boolean }>
  const targetByPhone = new Map<string, { phone: string; requireSiteWide: boolean }>()
  for (const target of configuredTargets) {
    const existing = targetByPhone.get(target.phone)
    targetByPhone.set(target.phone, { phone: target.phone, requireSiteWide: Boolean(existing?.requireSiteWide || target.requireSiteWide) })
  }
  const phoneTargets = [...targetByPhone.values()]
  const phones = [...new Set(phoneTargets.map(target => target.phone))]
  // Internal email alerts always go to the org owner/admin account.
  // Public contact emails are guest-facing data and must not double as notification routing.
  const emails = [...new Set([ownerEmail].filter(Boolean))] as string[]

  const channels = await getOwnerNotificationChannels(db, opts, phones.length > 0)

  if (channels.includes('email') && emails.length > 0) {
    await Promise.allSettled(emails.map(to =>
      sendEmailNotification(env, db, {
        ...opts,
        to,
        delivery: threadDelivery(threadContext, 'owner_alert', 'email', opts.template, to),
      })
    ))
  }

  if (channels.includes('whatsapp') && opts.whatsapp && phones.length > 0) {
    await Promise.allSettled(phoneTargets.map(async target => {
      const authorized = await isAuthorizedWhatsAppRecipient(db, {
        env,
        phone: target.phone,
        organizationId: opts.organizationId,
        siteId: opts.siteId,
        locationId: opts.locationId ?? null,
        requireSiteWide: target.requireSiteWide,
      })
      if (!authorized) {
        console.error('whatsapp_delivery_blocked', {
          organizationId: opts.organizationId,
          siteId: opts.siteId,
          locationId: opts.locationId ?? null,
          reason: 'recipient_access_pending',
        })
        return
      }
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
        await sendWhatsAppNotification(env, db, sendOptions)
      }
    }))
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Email subjects go into a header context, not HTML — strip CR/LF so a guest name can't
// inject additional headers, independent of the HTML-body escaping used elsewhere.
function sanitizeEmailHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function buildGuestReplyOwnerEmail(opts: {
  guestName: string
  inboundChannel: 'email' | 'whatsapp'
  messagePreview: string
  replyUrl: string | null
}): EmailTemplate {
  const sourceLabel = opts.inboundChannel === 'whatsapp' ? 'WhatsApp' : 'email'
  const escapedGuestName = escapeHtml(opts.guestName)
  const escapedPreview = escapeHtml(opts.messagePreview)
  const replyLink = opts.replyUrl
    ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(opts.replyUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#fb7461;color:#1a0805;text-decoration:none;font-weight:600;">Open thread in dashboard</a></p>`
    : ''

  return {
    subject: `New guest reply from ${sanitizeEmailHeaderValue(opts.guestName)}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <p style="margin:0 0 12px;">${escapedGuestName} sent a new reply by ${sourceLabel}.</p>
        <blockquote style="margin:0;padding:12px 14px;border-left:4px solid #fb7461;background:#fff7f4;color:#374151;">${escapedPreview}</blockquote>
        ${replyLink}
      </div>
    `,
    text: `${opts.guestName} sent a new reply by ${sourceLabel}.\n\n${opts.messagePreview}\n\n${opts.replyUrl ?? ''}`.trim(),
  }
}

async function sendPlatformEmailNotification(
  env: NotificationEnv,
  opts: {
    to: string
    replyTo?: string | null
    template: string
    title: string
    payload: Record<string, string>
    email: EmailTemplate
  }
) {
  const result = await sendEmail(env, {
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.email.subject,
    html: opts.email.html,
    text: opts.email.text,
  })
  if (result.status !== 'sent') throw new Error(result.error)
}

export async function notifyReservationCreated(
  env: NotificationEnv,
  db: DbClient,
  opts: ReservationNotificationInput
) {
  const restaurant = siteName(opts)
  const prettyDate = formatDateHuman(opts.date)
  const prettyTime = formatTimeHuman(opts.time)
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
    phone: opts.phone,
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
          phone: opts.phone,
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
  const prettyDate = formatDateHuman(opts.date)
  const prettyTime = formatTimeHuman(opts.time)
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
    phone: opts.phone,
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
          phone: opts.phone,
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
    experience_title: opts.experienceTitle ?? '',
    consent_acknowledged: opts.consentAcknowledged === true ? 'true' : 'false',
    deep_link: inboxUrl ?? '',
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    renderEmail(ContactOwnerNew, { guestName: opts.guestName, email: opts.email, subject: opts.subject, message: opts.message, siteName: restaurant, platformDomain, replyUrl: inboxUrl, experienceTitle: opts.experienceTitle, consentAcknowledged: opts.consentAcknowledged }),
    renderEmail(ContactGuestReceived, { guestName: opts.guestName, siteName: restaurant, subject: opts.subject, message: opts.message, platformDomain, experienceTitle: opts.experienceTitle, consentAcknowledged: opts.consentAcknowledged }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'contact',
      submissionId: opts.contactId,
      template: 'new_contact_msg',
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

export async function notifyPlatformContactSubmitted(
  env: NotificationEnv,
  db: DbClient,
  opts: PlatformContactNotificationInput
) {
  const siteLabel = 'KrabiClaw Support'
  const platformDomain = getPlatformDomain(env)
  const supportEmails = getPlatformSupportEmails(env)
  const payload = {
    contact_id: opts.contactId,
    guest_name: opts.guestName,
    email: opts.email,
    subject: opts.subject ?? '',
    message_preview: opts.message.slice(0, 200),
    source: opts.source ?? '',
    route_context: opts.routeContext ?? '',
    suggested_summary: opts.suggestedSummary ?? '',
    site_name: siteLabel,
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    renderEmail(ContactOwnerNew, {
      guestName: opts.guestName,
      email: opts.email,
      subject: opts.subject,
      message: opts.message,
      siteName: siteLabel,
      platformDomain,
    }),
    renderEmail(ContactGuestReceived, {
      guestName: opts.guestName,
      siteName: siteLabel,
      subject: opts.subject,
      message: opts.message,
      platformDomain,
    }),
  ])

  const ownerTasks = supportEmails.map(to =>
    sendPlatformEmailNotification(env, {
      to,
      replyTo: opts.email,
      template: 'platform_contact_owner_new',
      title: `New website message from ${opts.guestName}`,
      payload,
      email: {
        subject: `New website message from ${opts.guestName}`,
        html: ownerEmail.html,
        text: ownerEmail.text,
      },
    }),
  )

  const results = await Promise.allSettled([
    ...ownerTasks,
    sendPlatformEmailNotification(env, {
      to: opts.email,
      template: 'platform_contact_customer_received',
      title: 'Your message was sent',
      payload,
      email: {
        subject: 'Your message was sent',
        html: guestEmail.html,
        text: guestEmail.text,
      },
    }),
  ])

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('notifyPlatformContactSubmitted_failed', {
        task: index < ownerTasks.length ? 'sendPlatformOwnerEmail' : 'sendPlatformGuestEmail',
        contactId: opts.contactId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
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
    ? `Review reminder for ${opts.bookingLabel}`
    : `Review request for ${opts.bookingLabel}`

  const email = await renderEmail(templateComponent, {
    guestName: opts.guestName,
    siteName: restaurant,
    locationName: opts.locationName ?? null,
    bookingLabel: opts.bookingLabel,
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
      booking_label: opts.bookingLabel,
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

export async function notifyExperienceBookingCreated(
  env: NotificationEnv,
  db: DbClient,
  opts: ExperienceBookingNotificationInput
) {
  const studio = siteName(opts)
  const prettyDate = formatDateHuman(opts.bookingDate)
  const prettyTime = formatTimeHuman(opts.timeSlot)
  const platformDomain = getPlatformDomain(env)
  const [replyTo, inboxUrl] = await Promise.all([
    buildReplyToAddress(env, 'experience_booking', opts.bookingId),
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
  const threadContext = await getOpeningThreadContext(db, 'experience_booking', opts.bookingId)

  const payload = {
    booking_id: opts.bookingId,
    guest_name: opts.guestName,
    email: opts.email,
    experience: opts.experienceTitle,
    date: opts.bookingDate,
    time: opts.timeSlot,
    party_size: String(opts.partySize),
    requests: opts.notes ?? '',
    site_name: studio,
    deep_link: inboxUrl ?? '',
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    renderEmail(BookingOwnerNew, { guestName: opts.guestName, siteName: studio, experienceTitle: opts.experienceTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, email: opts.email, phone: opts.guestPhone ?? null, specialRequests: opts.notes, platformDomain, replyUrl: inboxUrl }),
    renderEmail(BookingGuestReceived, { guestName: opts.guestName, siteName: studio, experienceTitle: opts.experienceTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, specialRequests: opts.notes, contactPhone: opts.contactPhone ?? null, contactEmail: opts.contactEmail ?? null, cancelUrl: opts.cancelUrl ?? null, platformDomain }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      submissionType: 'experience_booking',
      submissionId: opts.bookingId,
      template: 'new_reservation',
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
          context: buildExperienceWhatsAppContext(opts.experienceTitle, opts.siteName),
          requests: opts.notes ?? '',
          reply_path: inboxUrlToWhatsAppReplyPath(inboxUrl),
        },
      },
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      replyTo,
      template: 'experience_booking_customer_received',
      title: `Your booking request was sent — ${opts.experienceTitle}`,
      payload,
      email: { subject: `Your booking request was sent — ${opts.experienceTitle}`, html: guestEmail.html, text: guestEmail.text },
      delivery: threadDelivery(threadContext, 'guest_acknowledgement', 'email', 'experience_booking_customer_received', opts.email),
    }),
  ])

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('notifyExperienceBookingCreated_failed', {
        task: index === 0 ? 'notifyOwner' : 'sendEmailNotification',
        bookingId: opts.bookingId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  })
}

export async function notifyExperienceBookingCancelled(
  env: NotificationEnv,
  db: DbClient,
  opts: ExperienceBookingNotificationInput
) {
  const confirmed = Boolean(opts.wasConfirmed)
  const studio = siteName(opts)
  const prettyDate = formatDateHuman(opts.bookingDate)
  const prettyTime = formatTimeHuman(opts.timeSlot)
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
    experience: opts.experienceTitle,
    date: opts.bookingDate,
    time: opts.timeSlot,
    party_size: String(opts.partySize),
    booking_was_confirmed: confirmed ? 'true' : 'false',
    site_name: studio,
    deep_link: inboxUrl ?? '',
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    renderEmail(BookingOwnerCancelled, { guestName: opts.guestName, siteName: studio, experienceTitle: opts.experienceTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, email: opts.email, phone: opts.guestPhone, notes: opts.notes, wasConfirmed: confirmed, platformDomain, replyUrl: inboxUrl }),
    renderEmail(BookingGuestCancelled, { guestName: opts.guestName, siteName: studio, experienceTitle: opts.experienceTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, notes: opts.notes, wasConfirmed: confirmed, platformDomain }),
  ])
  const threadContext = await recordGuestCancellation(db, {
    submissionType: 'experience_booking',
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
      submissionType: 'experience_booking',
      submissionId: opts.bookingId,
      template: 'experience_booking_cancelled',
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
          context: buildExperienceWhatsAppContext(opts.experienceTitle, opts.siteName),
          requests: opts.notes ?? '',
          reply_path: inboxUrlToWhatsAppReplyPath(inboxUrl),
        },
      },
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'experience_booking_customer_cancelled',
      title: guestCancelTitle,
      payload,
      email: { subject: guestCancelTitle, html: guestEmail.html, text: guestEmail.text },
      delivery: threadDelivery(threadContext, 'status_update', 'email', 'experience_booking_customer_cancelled', opts.email),
    }),
  ])

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('notifyExperienceBookingCancelled_failed', {
        task: index === 0 ? 'notifyOwner' : 'sendEmailNotification',
        bookingId: opts.bookingId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
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
    thread_id: opts.threadId,
    submission_type: opts.submissionType,
    submission_id: opts.submissionId,
    guest_name: opts.guestName,
    inbound_channel: opts.inboundChannel,
    message_preview: opts.messagePreview.slice(0, 200),
    deep_link: replyUrl ?? '',
  }

  const title = `New guest reply from ${opts.guestName}`
  const email = buildGuestReplyOwnerEmail({
    guestName: opts.guestName,
    inboundChannel: opts.inboundChannel,
    messagePreview: opts.messagePreview,
    replyUrl,
  })

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
  const ownerEmail = await getOrganizationOwnerEmail(env, opts.organizationId)
  const phones = [...new Set([locationPhone, sitePhone].filter(Boolean))] as string[]
  const emails = [...new Set([ownerEmail].filter(Boolean))] as string[]
  const channels = await getOwnerNotificationChannels(db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    siteName: opts.siteName ?? null,
  }, phones.length > 0)

  if (channels.includes('email') && emails.length > 0) {
    await Promise.allSettled(emails.map(to => sendEmailNotification(env, db, {
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      siteName: opts.siteName ?? null,
      locationId: opts.locationId ?? null,
      to,
      template: 'guest_thread_reply_email',
      title,
      payload,
      email,
      delivery: threadDelivery(threadContext, 'owner_alert', 'email', 'guest_thread_reply_email', to),
    })))
  }

  if (channels.includes('whatsapp') && phones.length > 0) {
    await Promise.allSettled(phones.map(async (toPhone) => {
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
  ] = await Promise.all([
    renderEmail(ReservationOwnerNew, { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', phone: '+1 555 123 4567', email: 'alex@example.com', platformDomain, replyUrl: 'https://demo.krabiclaw.com/dashboard/ember-slice/sites/ember-slice/locations/main/inbox/res-preview-1' }),
    renderEmail(ReservationGuestReceived, { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', contactPhone: '+1 555 000 0000', contactEmail: 'hello@emberslice.example', cancelUrl: 'https://demo.krabiclaw.com/reservations/cancel?id=res-preview-1', platformDomain }),
    renderEmail(ReservationGuestCancelled, { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', locationName: 'Main Dining Room', specialRequests: 'Window seat', wasConfirmed: false, platformDomain }),
    renderEmail(ReservationOwnerCancelled, { guestName: 'Alex Carter', siteName: restaurant, date: 'Tue, Jul 14, 2026', time: '7:00 PM', guests: '2', phone: '+1 555 123 4567', email: 'alex@example.com', locationName: 'Main Dining Room', specialRequests: 'Window seat', wasConfirmed: false, platformDomain }),
    renderEmail(ContactOwnerNew, { guestName: 'Jordan Lee', email: 'jordan@example.com', message: 'Hi, do you have vegan options and parking nearby?', siteName: restaurant, platformDomain, replyUrl: 'https://demo.krabiclaw.com/dashboard/ember-slice/sites/ember-slice/inbox/contact-preview-1', consentAcknowledged: true }),
    renderEmail(ContactGuestReceived, { guestName: 'Jordan Lee', siteName: restaurant, subject: 'general', message: 'Hi, do you have vegan options and parking nearby?', platformDomain, consentAcknowledged: true }),
    renderEmail(BookingOwnerNew, { guestName: 'Mina Park', siteName: studio, experienceTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM', partySize: 2, email: 'mina@example.com', phone: '+66 76 000 0002', platformDomain, replyUrl: 'https://demo.krabiclaw.com/dashboard/pottery-house-krabi/sites/pottery-house/locations/main/inbox/booking-preview-1' }),
    renderEmail(BookingGuestReceived, { guestName: 'Mina Park', siteName: studio, experienceTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM', partySize: 2, contactPhone: '+66 76 000 0001', contactEmail: 'hello@example.com', cancelUrl: 'https://demo.krabiclaw.com/experiences/cancel?id=booking-preview-1', platformDomain }),
    renderEmail(OrganizationInvite, { organizationName: studio, inviterName: 'Priya Shah', role: 'admin', inviteUrl: 'https://demo.krabiclaw.com/accept-invitation/invite-preview-1', platformDomain }),
  ])

  return [
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
      template: 'experience_booking_customer_received',
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
