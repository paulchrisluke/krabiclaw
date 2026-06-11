import { logOnlyEmailProviderId, shouldSendRealEmail } from '~/server/utils/email-delivery'
import { getOrgWhatsAppPhone, sendWhatsAppNotification, type WhatsAppTemplate } from '~/server/utils/whatsapp'

type NotificationChannel = 'email' | 'whatsapp'

interface NotificationEnv {
  RESEND_API_KEY?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
  EMAIL_FROM?: string
  EMAIL_DELIVERY_MODE?: string
}

interface SiteContext {
  organizationId: string
  siteId: string
  siteName?: string | null
}

interface ReservationNotificationInput extends SiteContext {
  reservationId: string
  guestName: string
  email: string
  phone: string
  date: string
  time: string
  guests: string
  wasConfirmed?: boolean
  cancelUrl?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
}

interface ContactNotificationInput extends SiteContext {
  contactId: string
  guestName: string
  email: string
  message: string
}

interface ExperienceBookingNotificationInput extends SiteContext {
  bookingId: string
  guestName: string
  email: string
  guestPhone?: string | null
  experienceTitle: string
  bookingDate: string
  timeSlot: string
  partySize: number
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

const BRAND_LOGO_URL = 'https://krabiclaw.com/krabi-claw-logo.png'

function emailShell(opts: {
  title: string
  preheader?: string
  siteName?: string | null
  bodyHtml: string
}): string {
  const preheader = escapeHtml(opts.preheader || opts.title)
  const title = escapeHtml(opts.title)
  const signature = escapeHtml(siteName({ organizationId: '', siteId: '', siteName: opts.siteName }, 'KrabiClaw'))

  return `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
  <div style="margin:0;padding:24px;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden">
      <div style="padding:18px 24px;border-bottom:1px solid #e4e4e7;background:#fafafa">
        <img src="${BRAND_LOGO_URL}" alt="KrabiClaw" width="164" style="display:block;height:auto;border:0;outline:none;text-decoration:none">
      </div>
      <div style="padding:24px">
        <h2 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#111827">${title}</h2>
        ${opts.bodyHtml}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #e4e4e7;background:#fafafa;color:#71717a;font-size:12px;line-height:1.6">
        Sent by ${signature} via KrabiClaw.
      </div>
    </div>
  </div>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

async function getOwnerEmail(db: D1Database, organizationId: string): Promise<string | null> {
  const row = await db.prepare(ownerEmailQuery()).bind(organizationId).first<{ email?: string }>()
  return row?.email ?? null
}

async function getOwnerNotificationChannels(
  db: D1Database,
  opts: SiteContext,
  hasWhatsAppPhone: boolean
): Promise<NotificationChannel[]> {
  const row = await db.prepare(`
    SELECT value FROM site_config
    WHERE organization_id = ? AND site_id = ? AND key = 'owner_notification_channels'
    LIMIT 1
  `).bind(opts.organizationId, opts.siteId).first<{ value?: string }>()

  if (!row?.value) return hasWhatsAppPhone ? ['whatsapp'] : ['email']

  const rawChannels = JSON.parse(row.value) as string[]

  const channels = rawChannels
    .map(channel => channel.trim().toLowerCase())
    .filter((channel): channel is NotificationChannel => channel === 'email' || channel === 'whatsapp')

  return [...new Set(channels)]
}

async function insertDashboardNotification(
  db: D1Database,
  opts: SiteContext & {
    template: string
    title: string
    payload: Record<string, string>
  }
): Promise<void> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  try {
    await db.prepare(`
      INSERT INTO notifications
      (id, organization_id, site_id, channel, template, title, payload, status, sent_at, created_at)
      VALUES (?, ?, ?, 'dashboard', ?, ?, ?, 'sent', ?, ?)
    `).bind(
      id,
      opts.organizationId,
      opts.siteId,
      opts.template,
      opts.title,
      JSON.stringify(opts.payload),
      now,
      now
    ).run()
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
  db: D1Database,
  opts: SiteContext & {
    to: string
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
  await db.prepare(`
    INSERT INTO notifications
    (id, organization_id, site_id, channel, template, recipient, title, payload, status, created_at)
    VALUES (?, ?, ?, 'email', ?, ?, ?, ?, 'pending', ?)
  `).bind(
    id,
    opts.organizationId,
    opts.siteId,
    opts.template,
    opts.to,
    opts.title,
    JSON.stringify(payloadWithPreview),
    now
  ).run()

  if (!shouldSendRealEmail(env)) {
    await db.prepare(`UPDATE notifications SET status = 'sent', provider_message_id = ?, sent_at = ?, error = NULL WHERE id = ?`)
      .bind(logOnlyEmailProviderId('notification'), new Date().toISOString(), id)
      .run()
    console.info('email_delivery_log_only', {
      notificationId: id,
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      template: opts.template,
      recipient: opts.to,
      title: opts.title,
    })
    return
  }

  if (!env.RESEND_API_KEY) {
    await db.prepare(`UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`)
      .bind('RESEND_API_KEY not configured', new Date().toISOString(), id)
      .run()
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
        subject: opts.email.subject,
        html: opts.email.html,
        text: opts.email.text
      }),
      signal: controller.signal
    })
  } catch (error) {
    clearTimeout(timeout)
    const message = error instanceof Error ? error.message : 'Email request failed'
    await db.prepare(`UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`)
      .bind(message, new Date().toISOString(), id)
      .run()
    return
  }
  
  clearTimeout(timeout)

  if (!response.ok) {
    const error = await response.text()
    await db.prepare(`UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`)
      .bind(error, new Date().toISOString(), id)
      .run()
    return
  }

  const data = await response.json().catch(() => ({})) as { id?: string }
  await db.prepare(`UPDATE notifications SET status = 'sent', provider_message_id = ?, sent_at = ? WHERE id = ?`)
    .bind(data.id ?? null, new Date().toISOString(), id)
    .run()
}

async function notifyOwner(
  env: NotificationEnv,
  db: D1Database,
  opts: SiteContext & {
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

  const whatsappPhone = await getOrgWhatsAppPhone(db, opts.organizationId, opts.siteId)
  const channels = await getOwnerNotificationChannels(db, opts, Boolean(whatsappPhone))

  if (channels.includes('email')) {
    const ownerEmail = await getOwnerEmail(db, opts.organizationId)
    if (ownerEmail) await sendEmailNotification(env, db, { ...opts, to: ownerEmail })
  }

  if (channels.includes('whatsapp') && whatsappPhone && opts.whatsapp) {
    await sendWhatsAppNotification(env, db, {
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      toPhone: whatsappPhone,
      template: opts.whatsapp.template,
      vars: opts.whatsapp.vars
    })
  }
}

function reservationEmail(opts: ReservationNotificationInput, title: string, intro: string): EmailTemplate {
  const restaurant = siteName(opts)
  const prettyDate = formatDateHuman(opts.date)
  const prettyTime = formatTimeHuman(opts.time)

  const contactBlock = (opts.contactPhone || opts.contactEmail)
    ? `<p style="margin-top:16px"><strong>Questions? Contact ${escapeHtml(restaurant)}:</strong><br>
       ${opts.contactPhone ? `📞 ${escapeHtml(opts.contactPhone)}<br>` : ''}
       ${opts.contactEmail ? `✉️ ${escapeHtml(opts.contactEmail)}` : ''}</p>`
    : ''

  const cancelBlock = opts.cancelUrl
    ? `<p style="margin-top:16px;font-size:12px;color:#71717a">Need to cancel? <a href="${escapeHtml(opts.cancelUrl)}" style="color:#8F1D21">Cancel your reservation here</a> (link valid for 30 days).</p>`
    : ''

  const bodyHtml = `
    <p>Hi ${escapeHtml(opts.guestName)},</p>
    <p>${escapeHtml(intro)}</p>
    <div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0"><strong>Restaurant:</strong> ${escapeHtml(restaurant)}</p>
      <p style="margin:8px 0 0"><strong>Date:</strong> ${escapeHtml(prettyDate)}</p>
      <p style="margin:4px 0 0"><strong>Time:</strong> ${escapeHtml(prettyTime)}</p>
      <p style="margin:4px 0 0"><strong>Party size:</strong> ${escapeHtml(opts.guests)}</p>
    </div>
    ${contactBlock}
    ${cancelBlock}
    <p style="color:#71717a;font-size:12px">The team at ${escapeHtml(restaurant)}</p>
  `
  const html = emailShell({
    title,
    preheader: `${title} — ${restaurant}`,
    siteName: restaurant,
    bodyHtml
  })

  const textParts = [
    `Hi ${opts.guestName},`,
    intro,
    '',
    `Restaurant: ${restaurant}`,
    `Date: ${prettyDate}`,
    `Time: ${prettyTime}`,
    `Party size: ${opts.guests}`,
  ]
  if (opts.contactPhone) textParts.push(`Phone: ${opts.contactPhone}`)
  if (opts.contactEmail) textParts.push(`Email: ${opts.contactEmail}`)
  if (opts.cancelUrl)    textParts.push(`\nCancel reservation: ${opts.cancelUrl}`)
  textParts.push('', `The team at ${restaurant}`)

  return { subject: title, html, text: textParts.join('\n') }
}

export async function notifyReservationCreated(
  env: NotificationEnv,
  db: D1Database,
  opts: ReservationNotificationInput
) {
  const payload = {
    reservation_id: opts.reservationId,
    guest_name: opts.guestName,
    email: opts.email,
    phone: opts.phone,
    date: opts.date,
    time: opts.time,
    guests: opts.guests,
    site_name: siteName(opts)
  }

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      template: 'new_reservation',
      title: `New reservation request from ${opts.guestName}`,
      payload,
      email: {
        subject: `New reservation request from ${opts.guestName}`,
        html: emailShell({
          title: `New reservation request from ${opts.guestName}`,
          preheader: `New reservation request for ${siteName(opts)}`,
          siteName: opts.siteName,
          bodyHtml: `<p>New reservation request from your website.</p><div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0"><strong>Customer:</strong> ${escapeHtml(opts.guestName)}</p><p style="margin:8px 0 0"><strong>Date:</strong> ${escapeHtml(formatDateHuman(opts.date))}</p><p style="margin:4px 0 0"><strong>Time:</strong> ${escapeHtml(formatTimeHuman(opts.time))}</p><p style="margin:4px 0 0"><strong>Party size:</strong> ${escapeHtml(opts.guests)}</p><p style="margin:4px 0 0"><strong>Phone:</strong> ${escapeHtml(opts.phone)}</p></div><p>Reply or contact the customer to confirm the reservation.</p>`
        }),
        text: `New reservation request from your website.\n\nCustomer: ${opts.guestName}\nDate: ${formatDateHuman(opts.date)}\nTime: ${formatTimeHuman(opts.time)}\nParty size: ${opts.guests}\nPhone: ${opts.phone}\n\nReply or contact the customer to confirm the reservation.`
      },
      whatsapp: {
        template: 'new_reservation',
        vars: { guest_name: opts.guestName, date: formatDateHuman(opts.date), time: formatTimeHuman(opts.time), guests: opts.guests, phone: opts.phone }
      }
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'reservation_customer_received',
      title: 'Your reservation request was sent',
      payload,
      email: reservationEmail(opts, 'Your reservation request was sent', `Thanks, ${opts.guestName}. Your reservation request has been sent to ${siteName(opts)}.`)
    })
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
  db: D1Database,
  opts: ReservationNotificationInput
) {
  const confirmed = Boolean(opts.wasConfirmed)
  const ownerCancelTitle = confirmed
    ? `Reservation cancelled for ${opts.guestName}`
    : `Reservation request cancelled by ${opts.guestName}`
  const guestCancelTitle = confirmed
    ? 'Your reservation was cancelled'
    : 'Your reservation request was cancelled'
  const guestCancelIntro = confirmed
    ? 'Your reservation has been cancelled.'
    : 'Your reservation request has been cancelled.'

  const payload = {
    reservation_id: opts.reservationId,
    guest_name: opts.guestName,
    email: opts.email,
    phone: opts.phone,
    date: opts.date,
    time: opts.time,
    guests: opts.guests,
    reservation_was_confirmed: confirmed ? 'true' : 'false',
    site_name: siteName(opts)
  }

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      template: 'reservation_cancelled',
      title: ownerCancelTitle,
      payload,
      email: {
        subject: ownerCancelTitle,
        html: emailShell({
          title: ownerCancelTitle,
          preheader: `Cancellation for ${siteName(opts)}`,
          siteName: opts.siteName,
          bodyHtml: `<p>A reservation was cancelled for ${escapeHtml(siteName(opts))}.</p><p><strong>${escapeHtml(opts.guestName)}</strong><br>${escapeHtml(opts.date)} at ${escapeHtml(opts.time)}<br>${escapeHtml(opts.guests)} guests</p><p style="color:#71717a;font-size:12px;margin-top:14px">No action is required unless you need to follow up with the guest.</p>`
        }),
        text: `Reservation cancelled for ${siteName(opts)}\n${opts.guestName}\n${opts.date} at ${opts.time}\n${opts.guests} guests`
      },
      whatsapp: {
        template: 'reservation_cancelled',
        vars: { guest_name: opts.guestName, date: opts.date, time: opts.time, guests: opts.guests, phone: opts.phone }
      }
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'reservation_customer_cancelled',
      title: guestCancelTitle,
      payload,
      email: reservationEmail(opts, guestCancelTitle, guestCancelIntro)
    })
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
  db: D1Database,
  opts: ContactNotificationInput
) {
  const payload = {
    contact_id: opts.contactId,
    guest_name: opts.guestName,
    email: opts.email,
    message_preview: opts.message.slice(0, 200),
    site_name: siteName(opts)
  }

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      template: 'new_contact_msg',
      title: `New website message from ${opts.guestName}`,
      payload,
      email: {
        subject: `New website message from ${opts.guestName}`,
        html: emailShell({
          title: `New website message from ${opts.guestName}`,
          preheader: `New contact message for ${siteName(opts)}`,
          siteName: opts.siteName,
          bodyHtml: `<p>New website message from ${escapeHtml(opts.guestName)}.</p><p><strong>From:</strong> ${escapeHtml(opts.guestName)}<br><strong>Email:</strong> ${escapeHtml(opts.email)}</p><p><strong>Message:</strong><br>${escapeHtml(opts.message)}</p><p>Reply to the customer directly.</p>`
        }),
        text: `New website message from ${opts.guestName}.\n\nFrom: ${opts.guestName}\nEmail: ${opts.email}\n\nMessage:\n${opts.message}\n\nReply to the customer directly.`
      },
      whatsapp: {
        template: 'new_contact_msg',
        vars: { guest_name: opts.guestName, email: opts.email, message_preview: opts.message }
      }
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'contact_customer_received',
      title: 'Your message was sent',
      payload,
      email: {
        subject: 'Your message was sent',
        html: emailShell({
          title: 'Your message was sent',
          preheader: `Your message to ${siteName(opts)} was received`,
          siteName: opts.siteName,
          bodyHtml: `<p>Thanks, ${escapeHtml(opts.guestName)}. Your message has been sent to ${escapeHtml(siteName(opts))}.</p><p>They will reply using the contact details you provided.</p>`
        }),
        text: `Thanks, ${opts.guestName}. Your message has been sent to ${siteName(opts)}.\n\nThey will reply using the contact details you provided.`
      }
    })
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

export async function notifyExperienceBookingCreated(
  env: NotificationEnv,
  db: D1Database,
  opts: ExperienceBookingNotificationInput
) {
  const studio = siteName(opts, 'the business')
  const payload = {
    booking_id: opts.bookingId,
    guest_name: opts.guestName,
    email: opts.email,
    experience: opts.experienceTitle,
    date: opts.bookingDate,
    time: opts.timeSlot,
    party_size: String(opts.partySize),
    site_name: studio,
  }

  const ownerEmailHtml = emailShell({
    title: `New booking request from ${opts.guestName}`,
    preheader: `New experience booking for ${studio}`,
    siteName: opts.siteName,
    bodyHtml: `
    <p>New experience booking request from ${escapeHtml(opts.guestName)}.</p>
    <p>
      <strong>Business:</strong> ${escapeHtml(studio)}<br>
      <strong>Experience:</strong> ${escapeHtml(opts.experienceTitle)}<br>
      <strong>Customer:</strong> ${escapeHtml(opts.guestName)}<br>
      <strong>Date:</strong> ${escapeHtml(formatDateHuman(opts.bookingDate))}<br>
      <strong>Time:</strong> ${escapeHtml(formatTimeHuman(opts.timeSlot))}
    </p>
    <p>Contact the customer to confirm the booking.</p>
  `
  })

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      template: 'new_reservation',
      title: `New booking request from ${opts.guestName}`,
      payload,
      email: {
        subject: `New booking request from ${opts.guestName}`,
        html: ownerEmailHtml,
        text: `New experience booking request from ${opts.guestName}.\n\nBusiness: ${studio}\nExperience: ${opts.experienceTitle}\nCustomer: ${opts.guestName}\nDate: ${formatDateHuman(opts.bookingDate)}\nTime: ${formatTimeHuman(opts.timeSlot)}\n\nContact the customer to confirm the booking.`,
      },
      whatsapp: {
        template: 'new_reservation',
        vars: {
          guest_name: opts.guestName,
          date: formatDateHuman(opts.bookingDate),
          time: formatTimeHuman(opts.timeSlot),
          guests: String(opts.partySize),
          ...(opts.guestPhone ? { phone: opts.guestPhone } : {}),
        },
      },
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'experience_booking_customer_received',
      title: `Your booking request was sent — ${opts.experienceTitle}`,
      payload,
      email: {
        subject: `Your booking request was sent — ${opts.experienceTitle}`,
        html: emailShell({
          title: `Your booking request was sent — ${opts.experienceTitle}`,
          preheader: `We received your booking request`,
          siteName: opts.siteName,
          bodyHtml: `
          <p>Thanks, ${escapeHtml(opts.guestName)}. Your booking request has been sent to ${escapeHtml(studio)}.</p>
          <div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0">
            <p style="margin:0"><strong>Experience:</strong> ${escapeHtml(opts.experienceTitle)}</p>
            <p style="margin:8px 0 0"><strong>Date:</strong> ${escapeHtml(formatDateHuman(opts.bookingDate))}</p>
            <p style="margin:4px 0 0"><strong>Time:</strong> ${escapeHtml(formatTimeHuman(opts.timeSlot))}</p>
            <p style="margin:4px 0 0"><strong>Party size:</strong> ${opts.partySize}</p>
          </div>
          <p>${escapeHtml(studio)} will contact you to confirm availability.</p>
          <p style="color:#71717a;font-size:12px">The team at ${escapeHtml(studio)}</p>
        `
        }),
        text: [
          `Thanks, ${opts.guestName}. Your booking request has been sent to ${studio}.`,
          '',
          `Experience: ${opts.experienceTitle}`,
          `Date: ${formatDateHuman(opts.bookingDate)}`,
          `Time: ${formatTimeHuman(opts.timeSlot)}`,
          `Party size: ${opts.partySize}`,
          '',
          `${studio} will contact you to confirm availability.`,
        ].join('\n'),
      },
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

export function getNotificationCopyPreviews(): NotificationCopyPreview[] {
  const reservationSample: ReservationNotificationInput = {
    organizationId: 'org-demo',
    siteId: 'site-demo',
    siteName: 'Ember & Slice',
    reservationId: 'res-preview-1',
    guestName: 'Alex Carter',
    email: 'alex@example.com',
    phone: '+1 555 123 4567',
    date: '2026-07-14',
    time: '19:00',
    guests: '2',
    cancelUrl: 'https://demo.krabiclaw.com/reservations/cancel?id=res-preview-1',
    contactPhone: '+1 555 000 0000',
    contactEmail: 'hello@emberslice.example',
  }

  const contactSample: ContactNotificationInput = {
    organizationId: 'org-demo',
    siteId: 'site-demo',
    siteName: 'Ember & Slice',
    contactId: 'contact-preview-1',
    guestName: 'Jordan Lee',
    email: 'jordan@example.com',
    message: 'Hi, do you have vegan options and parking nearby?',
  }

  const bookingSample: ExperienceBookingNotificationInput = {
    organizationId: 'org-demo',
    siteId: 'site-demo',
    siteName: 'Pottery House Krabi',
    bookingId: 'booking-preview-1',
    guestName: 'Mina Park',
    email: 'mina@example.com',
    guestPhone: '+66 94 623 0215',
    experienceTitle: 'Pottery Wheel Class',
    bookingDate: '2026-07-20',
    timeSlot: '10:00',
    partySize: 2,
  }

  const guestReservationReceived = reservationEmail(
    reservationSample,
    'Your reservation request was sent',
    `Thanks, ${reservationSample.guestName}. Your reservation request has been sent to ${siteName(reservationSample)}.`
  )
  const guestReservationCancelled = reservationEmail(
    reservationSample,
    'Your reservation request was cancelled',
    'Your reservation request has been cancelled.'
  )

  const ownerReservationHtml = emailShell({
    title: `New reservation request from ${reservationSample.guestName}`,
    preheader: `New reservation request for ${siteName(reservationSample)}`,
    siteName: reservationSample.siteName,
    bodyHtml: `<p>New reservation request from your website.</p><div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0"><strong>Customer:</strong> ${escapeHtml(reservationSample.guestName)}</p><p style="margin:8px 0 0"><strong>Date:</strong> ${escapeHtml(formatDateHuman(reservationSample.date))}</p><p style="margin:4px 0 0"><strong>Time:</strong> ${escapeHtml(formatTimeHuman(reservationSample.time))}</p><p style="margin:4px 0 0"><strong>Party size:</strong> ${escapeHtml(reservationSample.guests)}</p><p style="margin:4px 0 0"><strong>Phone:</strong> ${escapeHtml(reservationSample.phone)}</p></div><p>Reply or contact the customer to confirm the reservation.</p>`
  })

  const ownerContactHtml = emailShell({
    title: `New website message from ${contactSample.guestName}`,
    preheader: `New contact message for ${siteName(contactSample)}`,
    siteName: contactSample.siteName,
    bodyHtml: `<p>New website message from ${escapeHtml(contactSample.guestName)}.</p><p><strong>From:</strong> ${escapeHtml(contactSample.guestName)}<br><strong>Email:</strong> ${escapeHtml(contactSample.email)}</p><p><strong>Message:</strong><br>${escapeHtml(contactSample.message)}</p><p>Reply to the customer directly.</p>`
  })

  const guestContactReceived: EmailTemplate = {
    subject: 'Your message was sent',
    html: emailShell({
      title: 'Your message was sent',
      preheader: `Your message to ${siteName(contactSample)} was received`,
      siteName: contactSample.siteName,
      bodyHtml: `<p>Thanks, ${escapeHtml(contactSample.guestName)}. Your message has been sent to ${escapeHtml(siteName(contactSample))}.</p><p>They will reply using the contact details you provided.</p>`
    }),
    text: `Thanks, ${contactSample.guestName}. Your message has been sent to ${siteName(contactSample)}.\n\nThey will reply using the contact details you provided.`
  }

  const ownerExperienceHtml = emailShell({
    title: `New booking request from ${bookingSample.guestName}`,
    preheader: `New experience booking for ${siteName(bookingSample)}`,
    siteName: bookingSample.siteName,
    bodyHtml: `<p>New experience booking request from ${escapeHtml(bookingSample.guestName)}.</p><p><strong>Business:</strong> ${escapeHtml(siteName(bookingSample))}<br><strong>Experience:</strong> ${escapeHtml(bookingSample.experienceTitle)}<br><strong>Customer:</strong> ${escapeHtml(bookingSample.guestName)}<br><strong>Date:</strong> ${escapeHtml(formatDateHuman(bookingSample.bookingDate))}<br><strong>Time:</strong> ${escapeHtml(formatTimeHuman(bookingSample.timeSlot))}</p><p>Contact the customer to confirm the booking.</p>`
  })

  const guestExperienceHtml: EmailTemplate = {
    subject: `Your booking request was sent — ${bookingSample.experienceTitle}`,
    html: emailShell({
      title: `Your booking request was sent — ${bookingSample.experienceTitle}`,
      preheader: 'We received your booking request',
      siteName: bookingSample.siteName,
      bodyHtml: `<p>Thanks, ${escapeHtml(bookingSample.guestName)}. Your booking request has been sent to ${escapeHtml(siteName(bookingSample))}.</p><div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0"><strong>Experience:</strong> ${escapeHtml(bookingSample.experienceTitle)}</p><p style="margin:8px 0 0"><strong>Date:</strong> ${escapeHtml(formatDateHuman(bookingSample.bookingDate))}</p><p style="margin:4px 0 0"><strong>Time:</strong> ${escapeHtml(formatTimeHuman(bookingSample.timeSlot))}</p><p style="margin:4px 0 0"><strong>Party size:</strong> ${bookingSample.partySize}</p></div><p>${escapeHtml(siteName(bookingSample))} will contact you to confirm availability.</p><p style="color:#71717a;font-size:12px">The team at ${escapeHtml(siteName(bookingSample))}</p>`
    }),
    text: `Thanks, ${bookingSample.guestName}. Your booking request has been sent to ${siteName(bookingSample)}.\n\nExperience: ${bookingSample.experienceTitle}\nDate: ${formatDateHuman(bookingSample.bookingDate)}\nTime: ${formatTimeHuman(bookingSample.timeSlot)}\nParty size: ${bookingSample.partySize}\n\n${siteName(bookingSample)} will contact you to confirm availability.`
  }

  return [
    {
      id: 'owner-new-reservation-email',
      audience: 'owner',
      channel: 'email',
      template: 'new_reservation',
      title: 'Owner alert — new reservation',
      subject: `New reservation request from ${reservationSample.guestName}`,
      html: ownerReservationHtml,
      text: `New reservation request from your website.\n\nCustomer: ${reservationSample.guestName}\nDate: ${formatDateHuman(reservationSample.date)}\nTime: ${formatTimeHuman(reservationSample.time)}\nParty size: ${reservationSample.guests}\nPhone: ${reservationSample.phone}\n\nReply or contact the customer to confirm the reservation.`,
    },
    {
      id: 'guest-reservation-received-email',
      audience: 'guest',
      channel: 'email',
      template: 'reservation_customer_received',
      title: 'Guest confirmation — reservation request sent',
      subject: guestReservationReceived.subject,
      html: guestReservationReceived.html,
      text: guestReservationReceived.text,
    },
    {
      id: 'guest-reservation-cancelled-email',
      audience: 'guest',
      channel: 'email',
      template: 'reservation_customer_cancelled',
      title: 'Guest confirmation — reservation request cancelled',
      subject: guestReservationCancelled.subject,
      html: guestReservationCancelled.html,
      text: guestReservationCancelled.text,
    },
    {
      id: 'owner-new-contact-email',
      audience: 'owner',
      channel: 'email',
      template: 'new_contact_msg',
      title: 'Owner alert — new contact message',
      subject: `New website message from ${contactSample.guestName}`,
      html: ownerContactHtml,
      text: `New website message from ${contactSample.guestName}.\n\nFrom: ${contactSample.guestName}\nEmail: ${contactSample.email}\n\nMessage:\n${contactSample.message}\n\nReply to the customer directly.`,
    },
    {
      id: 'guest-contact-received-email',
      audience: 'guest',
      channel: 'email',
      template: 'contact_customer_received',
      title: 'Guest confirmation — message sent',
      subject: guestContactReceived.subject,
      html: guestContactReceived.html,
      text: guestContactReceived.text,
    },
    {
      id: 'owner-new-experience-booking-email',
      audience: 'owner',
      channel: 'email',
      template: 'new_reservation',
      title: 'Owner alert — new experience booking',
      subject: `New booking request from ${bookingSample.guestName}`,
      html: ownerExperienceHtml,
      text: `New experience booking request from ${bookingSample.guestName}.\n\nBusiness: ${siteName(bookingSample)}\nExperience: ${bookingSample.experienceTitle}\nCustomer: ${bookingSample.guestName}\nDate: ${formatDateHuman(bookingSample.bookingDate)}\nTime: ${formatTimeHuman(bookingSample.timeSlot)}\n\nContact the customer to confirm the booking.`,
    },
    {
      id: 'guest-experience-booking-received-email',
      audience: 'guest',
      channel: 'email',
      template: 'experience_booking_customer_received',
      title: 'Guest confirmation — experience booking request sent',
      subject: guestExperienceHtml.subject,
      html: guestExperienceHtml.html,
      text: guestExperienceHtml.text,
    },
    {
      id: 'owner-new-contact-whatsapp',
      audience: 'owner',
      channel: 'whatsapp',
      template: 'new_contact_msg',
      title: 'Owner WhatsApp — new contact message',
      text: `New website message from ${contactSample.guestName}: "${contactSample.message}" Reply: ${contactSample.email}`,
    },
    {
      id: 'owner-new-reservation-whatsapp',
      audience: 'owner',
      channel: 'whatsapp',
      template: 'new_reservation',
      title: 'Owner WhatsApp — new reservation',
      text: `New reservation request: ${reservationSample.guestName}, ${formatDateHuman(reservationSample.date)} at ${formatTimeHuman(reservationSample.time)}, ${reservationSample.guests} guests. Phone: ${reservationSample.phone}.`,
    },
  ]
}
