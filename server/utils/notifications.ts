import { getOrgWhatsAppPhone, sendWhatsAppNotification, type WhatsAppTemplate } from '~/server/utils/whatsapp'

type NotificationChannel = 'email' | 'whatsapp'

interface NotificationEnv {
  RESEND_API_KEY?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
  EMAIL_FROM?: string
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function siteName(opts: SiteContext, fallback = 'the restaurant'): string {
  return opts.siteName || fallback
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
    JSON.stringify(opts.payload),
    now
  ).run()

  if (!env.RESEND_API_KEY) {
    await db.prepare(`UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`)
      .bind('RESEND_API_KEY not configured', new Date().toISOString(), id)
      .run()
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  const fromValue = env.EMAIL_FROM || (opts.siteName ? `${opts.siteName} <hello@krabiclaw.com>` : 'KrabiClaw <hello@krabiclaw.com>')

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

  const contactBlock = (opts.contactPhone || opts.contactEmail)
    ? `<p style="margin-top:16px"><strong>Questions? Contact us:</strong><br>
       ${opts.contactPhone ? `📞 ${escapeHtml(opts.contactPhone)}<br>` : ''}
       ${opts.contactEmail ? `✉️ ${escapeHtml(opts.contactEmail)}` : ''}</p>`
    : ''

  const cancelBlock = opts.cancelUrl
    ? `<p style="margin-top:16px;font-size:12px;color:#71717a">Need to cancel? <a href="${escapeHtml(opts.cancelUrl)}" style="color:#8F1D21">Cancel your reservation here</a> (link valid for 30 days).</p>`
    : ''

  const html = `
    <p>Hi ${escapeHtml(opts.guestName)},</p>
    <p>${escapeHtml(intro)}</p>
    <div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0"><strong>Restaurant:</strong> ${escapeHtml(restaurant)}</p>
      <p style="margin:8px 0 0"><strong>Date:</strong> ${escapeHtml(opts.date)}</p>
      <p style="margin:4px 0 0"><strong>Time:</strong> ${escapeHtml(opts.time)}</p>
      <p style="margin:4px 0 0"><strong>Guests:</strong> ${escapeHtml(opts.guests)}</p>
    </div>
    ${contactBlock}
    ${cancelBlock}
    <p>We look forward to welcoming you!</p>
    <p style="color:#71717a;font-size:12px">The team at ${escapeHtml(restaurant)}</p>
  `

  const textParts = [
    `Hi ${opts.guestName},`,
    intro,
    '',
    `Restaurant: ${restaurant}`,
    `Date: ${opts.date}`,
    `Time: ${opts.time}`,
    `Guests: ${opts.guests}`,
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
      title: `New reservation from ${opts.guestName}`,
      payload,
      email: {
        subject: `New reservation from ${opts.guestName}`,
        html: `<p>New reservation for ${escapeHtml(siteName(opts))}.</p><p><strong>${escapeHtml(opts.guestName)}</strong><br>${escapeHtml(opts.date)} at ${escapeHtml(opts.time)}<br>${escapeHtml(opts.guests)} guests<br>${escapeHtml(opts.phone)}</p>`,
        text: `New reservation for ${siteName(opts)}\n${opts.guestName}\n${opts.date} at ${opts.time}\n${opts.guests} guests\n${opts.phone}`
      },
      whatsapp: {
        template: 'new_reservation',
        vars: { guest_name: opts.guestName, date: opts.date, time: opts.time, guests: opts.guests, phone: opts.phone }
      }
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'reservation_customer_received',
      title: 'Reservation request received',
      payload,
      email: reservationEmail(opts, 'Reservation request received', 'We received your reservation request. The restaurant will confirm shortly.')
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
      template: 'reservation_cancelled',
      title: `Reservation cancelled by ${opts.guestName}`,
      payload,
      email: {
        subject: `Reservation cancelled by ${opts.guestName}`,
        html: `<p>A reservation was cancelled for ${escapeHtml(siteName(opts))}.</p><p><strong>${escapeHtml(opts.guestName)}</strong><br>${escapeHtml(opts.date)} at ${escapeHtml(opts.time)}<br>${escapeHtml(opts.guests)} guests</p>`,
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
      title: 'Reservation cancelled',
      payload,
      email: reservationEmail(opts, 'Reservation cancelled', 'Your reservation has been cancelled.')
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
      title: `New message from ${opts.guestName}`,
      payload,
      email: {
        subject: `New message from ${opts.guestName}`,
        html: `<p>New contact message for ${escapeHtml(siteName(opts))}.</p><p><strong>${escapeHtml(opts.guestName)}</strong><br>${escapeHtml(opts.email)}</p><p>${escapeHtml(opts.message)}</p>`,
        text: `New contact message for ${siteName(opts)}\n${opts.guestName}\n${opts.email}\n\n${opts.message}`
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
      title: 'Message received',
      payload,
      email: {
        subject: 'Message received',
        html: `<p>Hi ${escapeHtml(opts.guestName)},</p><p>Thanks for contacting ${escapeHtml(siteName(opts))}. The restaurant will reply soon.</p>`,
        text: `Hi ${opts.guestName},\nThanks for contacting ${siteName(opts)}. The restaurant will reply soon.`
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

  const ownerEmailHtml = `
    <p>New experience booking for ${escapeHtml(studio)}.</p>
    <p>
      <strong>${escapeHtml(opts.guestName)}</strong><br>
      ${escapeHtml(opts.experienceTitle)}<br>
      ${escapeHtml(opts.bookingDate)} at ${escapeHtml(opts.timeSlot)}<br>
      Party of ${opts.partySize}
    </p>
  `

  const results = await Promise.allSettled([
    notifyOwner(env, db, {
      ...opts,
      template: 'new_reservation',
      title: `New booking from ${opts.guestName}`,
      payload,
      email: {
        subject: `New booking from ${opts.guestName}`,
        html: ownerEmailHtml,
        text: `New booking for ${studio}\n${opts.guestName}\n${opts.experienceTitle}\n${opts.bookingDate} at ${opts.timeSlot}\nParty of ${opts.partySize}`,
      },
      whatsapp: {
        template: 'new_reservation',
        vars: {
          guest_name: opts.guestName,
          date: opts.bookingDate,
          time: opts.timeSlot,
          guests: String(opts.partySize),
          ...(opts.guestPhone ? { phone: opts.guestPhone } : {}),
        },
      },
    }),
    sendEmailNotification(env, db, {
      ...opts,
      to: opts.email,
      template: 'experience_booking_customer_received',
      title: `Booking request received — ${opts.experienceTitle}`,
      payload,
      email: {
        subject: `Booking request received — ${opts.experienceTitle}`,
        html: `
          <p>Hi ${escapeHtml(opts.guestName)},</p>
          <p>We received your booking request for <strong>${escapeHtml(opts.experienceTitle)}</strong> at ${escapeHtml(studio)}.</p>
          <div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0">
            <p style="margin:0"><strong>Experience:</strong> ${escapeHtml(opts.experienceTitle)}</p>
            <p style="margin:8px 0 0"><strong>Date:</strong> ${escapeHtml(opts.bookingDate)}</p>
            <p style="margin:4px 0 0"><strong>Time:</strong> ${escapeHtml(opts.timeSlot)}</p>
            <p style="margin:4px 0 0"><strong>Party size:</strong> ${opts.partySize}</p>
          </div>
          <p>We will confirm your booking shortly.</p>
          <p style="color:#71717a;font-size:12px">The team at ${escapeHtml(studio)}</p>
        `,
        text: [
          `Hi ${opts.guestName},`,
          `We received your booking request for ${opts.experienceTitle} at ${studio}.`,
          '',
          `Experience: ${opts.experienceTitle}`,
          `Date: ${opts.bookingDate}`,
          `Time: ${opts.timeSlot}`,
          `Party size: ${opts.partySize}`,
          '',
          'We will confirm your booking shortly.',
          `The team at ${studio}`,
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
