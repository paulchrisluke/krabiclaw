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
}

interface ContactNotificationInput extends SiteContext {
  contactId: string
  guestName: string
  email: string
  message: string
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

function siteName(opts: SiteContext): string {
  return opts.siteName || 'the restaurant'
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
  const html = `
    <p>Hi ${escapeHtml(opts.guestName)},</p>
    <p>${escapeHtml(intro)}</p>
    <p><strong>Restaurant:</strong> ${escapeHtml(restaurant)}</p>
    <p><strong>Date:</strong> ${escapeHtml(opts.date)}<br>
    <strong>Time:</strong> ${escapeHtml(opts.time)}<br>
    <strong>Guests:</strong> ${escapeHtml(opts.guests)}</p>
  `
  const text = [
    `Hi ${opts.guestName},`,
    intro,
    `Restaurant: ${restaurant}`,
    `Date: ${opts.date}`,
    `Time: ${opts.time}`,
    `Guests: ${opts.guests}`
  ].join('\n')

  return { subject: title, html, text }
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
