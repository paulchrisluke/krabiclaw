import { useRender } from 'vue-email'
import { hashEmail, logOnlyEmailProviderId, shouldSendRealEmail } from '~/server/utils/email-delivery'
import SiteTransferReminder from '~/server/emails/templates/SiteTransferReminder'

interface SiteTransferNotificationEnv {
  PLATFORM_OWNER_EMAILS?: string
  RESEND_API_KEY?: string
  EMAIL_DELIVERY_MODE?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

interface ReminderInput {
  organizationId: string
  siteId: string
  toEmail: string
  siteName: string
  transferUrl: string
  invitedPlan: string | null
  invitedDomain: string | null
  daysPending: number
  customDomainsPaused: boolean
}

function supportEmails(env: SiteTransferNotificationEnv): string[] {
  return String(env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

async function logEmailNotification(
  db: D1Database,
  opts: {
    organizationId: string
    siteId: string
    recipient: string
    title: string
    payload: Record<string, unknown>
    status?: 'pending' | 'failed' | 'sent'
    error?: string | null
  },
) {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await db.prepare(`
    INSERT INTO notifications
    (id, organization_id, site_id, channel, template, recipient, title, payload, status, error, sent_at, created_at)
    VALUES (?, ?, ?, 'email', 'site_transfer_reminder', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    opts.organizationId,
    opts.siteId,
    opts.recipient,
    opts.title,
    JSON.stringify(opts.payload),
    opts.status ?? 'pending',
    opts.error ?? null,
    opts.status === 'failed' || opts.status === 'sent' ? now : null,
    now,
  ).run()
  return id
}

async function sendReminderEmail(
  env: SiteTransferNotificationEnv,
  db: D1Database,
  opts: {
    organizationId: string
    siteId: string
    recipient: string
    title: string
    html: string
    text: string
    payload: Record<string, unknown>
  },
) {
  const notificationId = await logEmailNotification(db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    recipient: opts.recipient,
    title: opts.title,
    payload: opts.payload,
    status: shouldSendRealEmail(env)
      ? (env.RESEND_API_KEY ? 'pending' : 'failed')
      : 'pending',
    error: shouldSendRealEmail(env)
      ? (env.RESEND_API_KEY ? null : 'RESEND_API_KEY not configured')
      : null,
  })

  if (!shouldSendRealEmail(env)) {
    await db.prepare(`
      UPDATE notifications
      SET status = 'sent', provider_message_id = ?, sent_at = ?, error = NULL
      WHERE id = ?
    `).bind(logOnlyEmailProviderId('site-transfer'), new Date().toISOString(), notificationId).run()
    console.info('email_delivery_log_only', {
      notificationId,
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      recipient: hashEmail(opts.recipient),
      title: opts.title,
      template: 'site_transfer_reminder',
    })
    return
  }

  if (!env.RESEND_API_KEY) return

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'KrabiClaw <hello@krabiclaw.com>',
        to: [opts.recipient],
        subject: opts.title,
        html: opts.html,
        text: opts.text,
      }),
    })

    if (!response.ok) {
      const error = await response.text().catch(() => 'Failed to send email')
      await db.prepare(`
        UPDATE notifications
        SET status = 'failed', error = ?, sent_at = ?
        WHERE id = ?
      `).bind(error, new Date().toISOString(), notificationId).run()
      return
    }

    const data = await response.json().catch(() => null) as { id?: string } | null
    await db.prepare(`
      UPDATE notifications
      SET status = 'sent', provider_message_id = ?, sent_at = ?
      WHERE id = ?
    `).bind(data?.id ?? null, new Date().toISOString(), notificationId).run()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email'
    await db.prepare(`
      UPDATE notifications
      SET status = 'failed', error = ?, sent_at = ?
      WHERE id = ?
    `).bind(message, new Date().toISOString(), notificationId).run()
  }
}

export async function notifySiteTransferReminder(
  env: SiteTransferNotificationEnv,
  db: D1Database,
  opts: ReminderInput,
) {
  const title = opts.customDomainsPaused
    ? `Action needed: Finishing touches for ${opts.siteName}`
    : `Reminder: ${opts.siteName} is ready for you!`
  const _body = opts.customDomainsPaused
    ? `Your website is ready to go, but we just need to wrap up the payment setup to get your custom domain live and kicking.`
    : `Good news—your new website is ready and waiting for you to take the reins. Click below to review and claim it whenever you're ready.`

  const payload = {
    site_name: opts.siteName,
    transfer_url: opts.transferUrl,
    invited_plan: opts.invitedPlan,
    invited_domain: opts.invitedDomain,
    days_pending: opts.daysPending,
    custom_domains_paused: opts.customDomainsPaused,
  }

  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO notifications
    (id, organization_id, site_id, channel, template, title, payload, status, sent_at, created_at)
    VALUES (?, ?, ?, 'dashboard', 'site_transfer_reminder', ?, ?, 'sent', ?, ?)
  `).bind(
    crypto.randomUUID(),
    opts.organizationId,
    opts.siteId,
    title,
    JSON.stringify(payload),
    now,
    now,
  ).run()

  const planLabel: Record<string, string> = {
    growth: 'Growth ($49/mo)',
    managed: 'Managed ($149/mo)',
    seo_accelerator: 'SEO Accelerator ($349/mo)',
  }

  const platformDomain = (env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const { html, text } = await useRender(SiteTransferReminder, {
    props: {
      siteName: opts.siteName,
      transferUrl: opts.transferUrl,
      domain: opts.invitedDomain ?? null,
      planLabel: opts.invitedPlan ? (planLabel[opts.invitedPlan] ?? opts.invitedPlan) : null,
      customDomainsPaused: opts.customDomainsPaused,
      platformDomain,
    },
  })

  await sendReminderEmail(env, db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    recipient: opts.toEmail,
    title,
    html,
    text,
    payload: { ...payload, audience: 'recipient' },
  })

  await Promise.all(
    supportEmails(env).map((recipient) =>
      sendReminderEmail(env, db, {
        organizationId: opts.organizationId,
        siteId: opts.siteId,
        recipient,
        title: `[Admin] ${title}`,
        html,
        text,
        payload: { ...payload, audience: 'support' },
      }),
    ),
  )
}
