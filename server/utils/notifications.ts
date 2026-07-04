import { useRender } from 'vue-email'
import { execute, queryFirst, type DbClient } from '~/server/db'
import { hashEmail, isReservedTestDomain, logOnlyEmailProviderId, shouldSendRealEmail } from '~/server/utils/email-delivery'
import { getOrgWhatsAppPhone, sendWhatsAppNotification, type WhatsAppTemplate } from '~/server/utils/whatsapp'
import { buildReplyToAddress } from '~/server/utils/submission-messages'
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

const SUBJECT_LABELS: Record<string, string> = {
  general: 'General',
  press: 'Press',
  partnerships: 'Partnerships',
  catering: 'Catering',
  careers: 'Careers',
}

type NotificationChannel = 'email' | 'whatsapp'

interface NotificationEnv {
  RESEND_API_KEY?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
  EMAIL_FROM?: string
  EMAIL_DELIVERY_MODE?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
  EMAIL_REPLY_SECRET?: string
}

function getPlatformDomain(env: NotificationEnv): string {
  return (env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
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
}

interface ContactNotificationInput extends SiteContext {
  locationId?: string | null
  contactId: string
  guestName: string
  email: string
  subject?: string | null
  message: string
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
  contactPhone?: string | null
  contactEmail?: string | null
}

interface ReviewNotificationInput extends SiteContext {
  locationId?: string | null
  reviewId: string
  authorName: string
  rating: number
  content?: string | null
}

interface EmailTemplate {
  subject: string
  html: string
  text: string
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

function siteName(opts: SiteContext, fallback = 'the business'): string {
  return opts.siteName || fallback
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

function buildReservationWhatsAppContext(locationName?: string | null): string {
  return locationName?.trim() ? `Location: ${locationName.trim()}` : 'Location not provided'
}

function buildExperienceWhatsAppContext(experienceTitle: string, siteName?: string | null): string {
  const business = siteName?.trim() || 'the business'
  return `Business: ${business} · Experience: ${experienceTitle}`
}

function ownerEmailQuery() {
  return `
    SELECT u.email
    FROM user u
    JOIN member m ON u.id = m.userId
    WHERE m.organizationId = ? AND m.role IN ('owner', 'admin')
    ORDER BY m.role = 'owner' DESC, m.createdAt ASC
    LIMIT 1
  `
}

async function getOwnerEmail(db: DbClient, organizationId: string): Promise<string | null> {
  const row = await queryFirst<{ email?: string }>(db, ownerEmailQuery(), [organizationId])
  return row?.email ?? null
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

  let rawChannels: string[]
  try {
    rawChannels = JSON.parse(row.value) as string[]
    if (!Array.isArray(rawChannels)) {
      return hasWhatsAppPhone ? ['whatsapp'] : ['email']
    }
  } catch {
    return hasWhatsAppPhone ? ['whatsapp'] : ['email']
  }

  const channels = rawChannels
    .map(channel => channel.trim().toLowerCase())
    .filter((channel): channel is NotificationChannel => channel === 'email' || channel === 'whatsapp')

  const uniqueChannels = [...new Set(channels)]
  return uniqueChannels.length > 0 ? uniqueChannels : (hasWhatsAppPhone ? ['whatsapp'] : ['email'])
}

export async function insertDashboardNotification(
  db: DbClient,
  opts: SiteContext & {
    locationId?: string | null
    template: string
    title: string
    payload: Record<string, string>
  }
): Promise<void> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  try {
    await execute(db, `
      INSERT INTO notifications
      (id, organization_id, site_id, location_id, channel, template, title, payload, status, sent_at, created_at)
      VALUES (?, ?, ?, ?, 'dashboard', ?, ?, ?, 'sent', ?, ?)
    `, [
      id,
      opts.organizationId,
      opts.siteId,
      opts.locationId ?? null,
      opts.template,
      opts.title,
      JSON.stringify(opts.payload),
      now,
      now
    ])
  } catch (error) {
    console.error('dashboard_notification_failed', {
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      template: opts.template,
      notificationId: id,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

async function sendEmailNotification(
  env: NotificationEnv,
  db: DbClient,
  opts: SiteContext & {
    locationId?: string | null
    to: string
    replyTo?: string | null
    template: string
    title: string
    payload: Record<string, string>
    email: EmailTemplate
  }
) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const payloadWithPreview = {
    ...opts.payload,
    email_subject: opts.email.subject,
    email_html: opts.email.html,
    email_text: opts.email.text,
  }
  await execute(db, `
    INSERT INTO notifications
    (id, organization_id, site_id, location_id, channel, template, recipient, title, payload, status, created_at)
    VALUES (?, ?, ?, ?, 'email', ?, ?, ?, ?, 'pending', ?)
  `, [
    id,
    opts.organizationId,
    opts.siteId,
    opts.locationId ?? null,
    opts.template,
    opts.to,
    opts.title,
    JSON.stringify(payloadWithPreview),
    now
  ])

  if (!shouldSendRealEmail(env) || isReservedTestDomain(opts.to)) {
    await execute(
      db,
      `UPDATE notifications SET status = 'sent', provider_message_id = ?, sent_at = ?, error = NULL WHERE id = ?`,
      [logOnlyEmailProviderId('notification'), new Date().toISOString(), id],
    )
    console.info('email_delivery_log_only', {
      notificationId: id,
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      template: opts.template,
      recipient: hashEmail(opts.to),
      title: opts.title,
      reservedTestDomain: isReservedTestDomain(opts.to),
    })
    return
  }

  if (!env.RESEND_API_KEY) {
    await execute(
      db,
      `UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`,
      ['RESEND_API_KEY not configured', new Date().toISOString(), id],
    )
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  const fromValue = env.EMAIL_FROM || 'KrabiClaw <hello@krabiclaw.com>'

  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromValue,
        to: [opts.to],
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        subject: opts.email.subject,
        html: opts.email.html,
        text: opts.email.text
      }),
      signal: controller.signal
    })
  } catch (error) {
    clearTimeout(timeout)
    const message = error instanceof Error ? error.message : 'Email request failed'
    await execute(
      db,
      `UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`,
      [message, new Date().toISOString(), id],
    )
    return
  }

  clearTimeout(timeout)

  if (!response.ok) {
    const error = await response.text()
    await execute(
      db,
      `UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`,
      [error, new Date().toISOString(), id],
    )
    return
  }

  const data = await response.json().catch(() => ({})) as { id?: string }
  await execute(
    db,
    `UPDATE notifications SET status = 'sent', provider_message_id = ?, sent_at = ? WHERE id = ?`,
    [data.id ?? null, new Date().toISOString(), id],
  )
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
  }
) {
  await insertDashboardNotification(db, opts)

  const sitePhone = await getOrgWhatsAppPhone(db, opts.organizationId, opts.siteId)
  const locationPhone = opts.locationId ? await getLocationNotificationPhone(db, opts.locationId, opts.organizationId, opts.siteId) : null
  const ownerEmail = await getOwnerEmail(db, opts.organizationId)

  // Collect unique phones — location manager + owner (site-level), deduped
  const phones = [...new Set([locationPhone, sitePhone].filter(Boolean))] as string[]
  // Internal email alerts always go to the org owner/admin account.
  // Public contact emails are guest-facing data and must not double as notification routing.
  const emails = [...new Set([ownerEmail].filter(Boolean))] as string[]

  const channels = await getOwnerNotificationChannels(db, opts, phones.length > 0)

  if (channels.includes('email') && emails.length > 0) {
    await Promise.allSettled(emails.map(to =>
      sendEmailNotification(env, db, { ...opts, to })
    ))
  }

  if (channels.includes('whatsapp') && opts.whatsapp && phones.length > 0) {
    await Promise.allSettled(phones.map(toPhone =>
      sendWhatsAppNotification(env, db, {
        organizationId: opts.organizationId,
        siteId: opts.siteId,
        locationId: opts.locationId ?? null,
        toPhone,
        template: opts.whatsapp!.template,
        vars: opts.whatsapp!.vars,
      })
    ))
  }
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
  const replyTo = await buildReplyToAddress(env, 'reservation', opts.reservationId)

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
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    useRender(ReservationOwnerNew, { props: { guestName: opts.guestName, siteName: restaurant, date: prettyDate, time: prettyTime, guests: opts.guests, phone: opts.phone, email: opts.email, locationName: opts.locationName, specialRequests: opts.requests, platformDomain } }),
    useRender(ReservationGuestReceived, { props: { guestName: opts.guestName, siteName: restaurant, date: prettyDate, time: prettyTime, guests: opts.guests, specialRequests: opts.requests, locationName: opts.locationName, contactPhone: opts.contactPhone, contactEmail: opts.contactEmail, cancelUrl: opts.cancelUrl, platformDomain } }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      template: 'new_reservation',
      title: `New reservation request from ${opts.guestName}`,
      payload,
      email: { subject: `New reservation request from ${opts.guestName}`, html: ownerEmail.html, text: ownerEmail.text },
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
        },
      },
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      replyTo,
      template: 'reservation_customer_received',
      title: 'Your reservation request was sent',
      payload,
      email: { subject: 'Your reservation request was sent', html: guestEmail.html, text: guestEmail.text },
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
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    useRender(ReservationOwnerCancelled, { props: { guestName: opts.guestName, siteName: restaurant, date: prettyDate, time: prettyTime, guests: opts.guests, wasConfirmed: confirmed, platformDomain } }),
    useRender(ReservationGuestCancelled, { props: { guestName: opts.guestName, siteName: restaurant, date: prettyDate, time: prettyTime, guests: opts.guests, wasConfirmed: confirmed, platformDomain } }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      template: 'reservation_cancelled',
      title: ownerCancelTitle,
      payload,
      email: { subject: ownerCancelTitle, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'reservation_cancelled',
        vars: { guest_name: opts.guestName, date: prettyDate, time: prettyTime, guests: opts.guests, phone: opts.phone },
      },
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'reservation_customer_cancelled',
      title: guestCancelTitle,
      payload,
      email: { subject: guestCancelTitle, html: guestEmail.html, text: guestEmail.text },
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
  const payload = {
    contact_id: opts.contactId,
    guest_name: opts.guestName,
    email: opts.email,
    subject: opts.subject ?? '',
    message_preview: opts.message.slice(0, 200),
    site_name: restaurant,
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    useRender(ContactOwnerNew, { props: { guestName: opts.guestName, email: opts.email, subject: opts.subject, message: opts.message, siteName: restaurant, platformDomain } }),
    useRender(ContactGuestReceived, { props: { guestName: opts.guestName, siteName: restaurant, platformDomain } }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      template: 'new_contact_msg',
      title: `New website message from ${opts.guestName}`,
      payload,
      email: { subject: `New website message from ${opts.guestName}`, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'new_contact_msg',
        vars: { guest_name: opts.guestName, email: opts.email, subject: opts.subject ? SUBJECT_LABELS[opts.subject] ?? opts.subject : '', message_preview: opts.message },
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

  try {
    const ownerEmail = await useRender(ReviewOwnerNew, {
      props: {
        authorName: opts.authorName,
        rating: opts.rating,
        content: opts.content ?? '',
        siteName: restaurant,
        platformDomain,
      },
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
      },
      email: { subject: `New review from ${opts.authorName}`, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'new_review',
        vars: { rating: String(opts.rating), site_name: restaurant, excerpt: opts.content ?? '' },
      },
    })
  } catch (error) {
    console.error('notifyReviewReceived_failed', {
      reviewId: opts.reviewId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export async function notifyExperienceBookingCreated(
  env: NotificationEnv,
  db: DbClient,
  opts: ExperienceBookingNotificationInput
) {
  const studio = siteName(opts, 'the business')
  const prettyDate = formatDateHuman(opts.bookingDate)
  const prettyTime = formatTimeHuman(opts.timeSlot)
  const platformDomain = getPlatformDomain(env)
  const replyTo = await buildReplyToAddress(env, 'experience_booking', opts.bookingId)

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
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    useRender(BookingOwnerNew, { props: { guestName: opts.guestName, siteName: studio, experienceTitle: opts.experienceTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, email: opts.email, phone: opts.guestPhone ?? null, specialRequests: opts.notes, platformDomain } }),
    useRender(BookingGuestReceived, { props: { guestName: opts.guestName, siteName: studio, experienceTitle: opts.experienceTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, specialRequests: opts.notes, contactPhone: opts.contactPhone ?? null, contactEmail: opts.contactEmail ?? null, platformDomain } }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
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
  const studio = siteName(opts, 'the business')
  const prettyDate = formatDateHuman(opts.bookingDate)
  const prettyTime = formatTimeHuman(opts.timeSlot)
  const platformDomain = getPlatformDomain(env)
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
  }

  const [ownerEmail, guestEmail] = await Promise.all([
    useRender(BookingOwnerCancelled, { props: { guestName: opts.guestName, siteName: studio, experienceTitle: opts.experienceTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, wasConfirmed: confirmed, platformDomain } }),
    useRender(BookingGuestCancelled, { props: { guestName: opts.guestName, siteName: studio, experienceTitle: opts.experienceTitle, date: prettyDate, time: prettyTime, partySize: opts.partySize, wasConfirmed: confirmed, platformDomain } }),
  ])

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      template: 'experience_booking_cancelled',
      title: ownerCancelTitle,
      payload,
      email: { subject: ownerCancelTitle, html: ownerEmail.html, text: ownerEmail.text },
      whatsapp: {
        template: 'reservation_cancelled',
        vars: { guest_name: opts.guestName, date: prettyDate, time: prettyTime, guests: String(opts.partySize), phone: opts.guestPhone ?? '' },
      },
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'experience_booking_customer_cancelled',
      title: guestCancelTitle,
      payload,
      email: { subject: guestCancelTitle, html: guestEmail.html, text: guestEmail.text },
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
  ] = await Promise.all([
    useRender(ReservationOwnerNew, { props: { guestName: 'Alex Carter', siteName: restaurant, date: 'Mon, Jul 14, 2026', time: '7:00 PM', guests: '2', phone: '+1 555 123 4567', email: 'alex@example.com', platformDomain } }),
    useRender(ReservationGuestReceived, { props: { guestName: 'Alex Carter', siteName: restaurant, date: 'Mon, Jul 14, 2026', time: '7:00 PM', guests: '2', contactPhone: '+1 555 000 0000', contactEmail: 'hello@emberslice.example', cancelUrl: 'https://demo.krabiclaw.com/reservations/cancel?id=res-preview-1', platformDomain } }),
    useRender(ReservationGuestCancelled, { props: { guestName: 'Alex Carter', siteName: restaurant, date: 'Mon, Jul 14, 2026', time: '7:00 PM', guests: '2', wasConfirmed: false, platformDomain } }),
    useRender(ReservationOwnerCancelled, { props: { guestName: 'Alex Carter', siteName: restaurant, date: 'Mon, Jul 14, 2026', time: '7:00 PM', guests: '2', wasConfirmed: false, platformDomain } }),
    useRender(ContactOwnerNew, { props: { guestName: 'Jordan Lee', email: 'jordan@example.com', message: 'Hi, do you have vegan options and parking nearby?', siteName: restaurant, platformDomain } }),
    useRender(ContactGuestReceived, { props: { guestName: 'Jordan Lee', siteName: restaurant, platformDomain } }),
    useRender(BookingOwnerNew, { props: { guestName: 'Mina Park', siteName: studio, experienceTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM', partySize: 2, email: 'mina@example.com', phone: '+66 76 000 0002', platformDomain } }),
    useRender(BookingGuestReceived, { props: { guestName: 'Mina Park', siteName: studio, experienceTitle: 'Pottery Wheel Class', date: 'Mon, Jul 20, 2026', time: '10:00 AM', partySize: 2, contactPhone: '+66 76 000 0001', contactEmail: 'hello@example.com', platformDomain } }),
  ])

  return [
    {
      id: 'owner-new-reservation-email',
      audience: 'owner',
      channel: 'email',
      template: 'new_reservation',
      title: 'Owner alert — new reservation',
      subject: 'New reservation request from Alex Carter',
      html: ownerReservation.html,
      text: ownerReservation.text,
    },
    {
      id: 'guest-reservation-received-email',
      audience: 'guest',
      channel: 'email',
      template: 'reservation_customer_received',
      title: 'Guest confirmation — reservation request sent',
      subject: 'Your reservation request was sent',
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
      text: 'New reservation request: Alex Carter, Mon, Jul 14, 2026 at 7:00 PM, 2 guests. Phone: +1 555 123 4567. Email: alex@example.com. Location: Main Dining Room. Special requests: Window seat.',
    },
    {
      id: 'owner-new-experience-booking-whatsapp',
      audience: 'owner',
      channel: 'whatsapp',
      template: 'new_reservation',
      title: 'Owner WhatsApp — new experience booking',
      text: 'New booking request: Mina Park, Mon, Jul 20, 2026 at 10:00 AM, 2 guests. Phone: +66 76 000 0002. Email: mina@example.com. Business: Pottery House Krabi · Experience: Pottery Wheel Class. Special requests: None.',
    },
  ]
}
