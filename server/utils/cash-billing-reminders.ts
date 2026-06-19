import { useRender } from 'vue-email'
import { hashEmail, logOnlyEmailProviderId, shouldSendRealEmail } from '~/server/utils/email-delivery'
import CashBillingReminderClient from '~/server/emails/templates/CashBillingReminderClient'
import CashBillingReminderAdmin from '~/server/emails/templates/CashBillingReminderAdmin'

interface CashBillingEnv {
  PLATFORM_OWNER_EMAILS?: string
  RESEND_API_KEY?: string
  EMAIL_DELIVERY_MODE?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

// Send reminder if period ends within this many days
const REMIND_WITHIN_DAYS = 7
// Don't re-send within this many days
const RESEND_COOLDOWN_DAYS = 2

interface CashBillingRow {
  site_id: string
  organization_id: string
  brand_name: string | null
  owner_email: string | null
  local_rate: number
  local_currency: string
  current_period_end: string
  last_reminder_sent_at: string | null
  stripe_subscription_id: string | null
}

function adminEmails(env: CashBillingEnv): string[] {
  return String(env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysUntil(iso: string, now: Date): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

async function sendEmail(
  env: CashBillingEnv,
  db: D1Database,
  opts: {
    organizationId: string
    siteId: string
    recipient: string
    subject: string
    html: string
    text: string
    template: string
    payload: Record<string, unknown>
  },
) {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  if (!shouldSendRealEmail(env)) {
    await db.prepare(`
      INSERT INTO notifications
      (id, organization_id, site_id, channel, template, recipient, title, payload, status, provider_message_id, sent_at, created_at)
      VALUES (?, ?, ?, 'email', ?, ?, ?, ?, 'sent', ?, ?, ?)
    `).bind(
      id, opts.organizationId, opts.siteId, opts.template,
      opts.recipient, opts.subject, JSON.stringify(opts.payload),
      logOnlyEmailProviderId('cash-billing'), now, now,
    ).run()
    console.info('email_delivery_log_only', {
      notificationId: id,
      recipient: hashEmail(opts.recipient),
      subject: opts.subject,
      template: opts.template,
    })
    return
  }

  if (!env.RESEND_API_KEY) {
    await db.prepare(`
      INSERT INTO notifications
      (id, organization_id, site_id, channel, template, recipient, title, payload, status, error, created_at)
      VALUES (?, ?, ?, 'email', ?, ?, ?, ?, 'failed', 'RESEND_API_KEY not configured', ?)
    `).bind(id, opts.organizationId, opts.siteId, opts.template, opts.recipient, opts.subject, JSON.stringify(opts.payload), now).run()
    return
  }

  await db.prepare(`
    INSERT INTO notifications
    (id, organization_id, site_id, channel, template, recipient, title, payload, status, created_at)
    VALUES (?, ?, ?, 'email', ?, ?, ?, ?, 'pending', ?)
  `).bind(id, opts.organizationId, opts.siteId, opts.template, opts.recipient, opts.subject, JSON.stringify(opts.payload), now).run()

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'KrabiClaw <hello@krabiclaw.com>',
        to: [opts.recipient],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    })
    if (!res.ok) {
      const error = await res.text().catch(() => 'Send failed')
      await db.prepare('UPDATE notifications SET status=\'failed\', error=?, sent_at=? WHERE id=?')
        .bind(error, new Date().toISOString(), id).run()
      return
    }
    const data = await res.json().catch(() => null) as { id?: string } | null
    await db.prepare('UPDATE notifications SET status=\'sent\', provider_message_id=?, sent_at=? WHERE id=?')
      .bind(data?.id ?? null, new Date().toISOString(), id).run()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed'
    await db.prepare('UPDATE notifications SET status=\'failed\', error=?, sent_at=? WHERE id=?')
      .bind(message, new Date().toISOString(), id).run()
  }
}

export async function processCashBillingReminders(
  env: CashBillingEnv,
  db: D1Database,
  opts: { now?: Date } = {},
): Promise<{ reminded: number; checked: number }> {
  const now = opts.now ?? new Date()
  const windowEnd = new Date(now.getTime() + REMIND_WITHIN_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const cooldownCutoff = new Date(now.getTime() - RESEND_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const rows = await db.prepare(`
    SELECT sb.site_id, sb.organization_id, s.brand_name,
           u.email AS owner_email,
           sb.local_rate, sb.local_currency,
           sb.current_period_end, sb.last_reminder_sent_at,
           sb.stripe_subscription_id
    FROM site_billing sb
    JOIN sites s ON s.id = sb.site_id
    LEFT JOIN member m ON m.organizationId = sb.organization_id AND m.role = 'owner'
    LEFT JOIN user u ON u.id = m.userId
    WHERE sb.payment_method = 'cash'
      AND sb.status = 'active'
      AND sb.current_period_end IS NOT NULL
      AND sb.local_rate IS NOT NULL
      AND datetime(sb.current_period_end) <= datetime(?)
      AND datetime(sb.current_period_end) >= datetime(?, '-1 day')
      AND (sb.last_reminder_sent_at IS NULL OR datetime(sb.last_reminder_sent_at) <= datetime(?))
  `).bind(windowEnd, now.toISOString(), cooldownCutoff).all<CashBillingRow>()

  let reminded = 0
  const platformDomain = (env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const adminUrl = `https://${platformDomain}/admin`

  for (const row of rows.results ?? []) {
    const siteName = row.brand_name ?? row.site_id
    const clientEmail = row.owner_email
    if (!clientEmail) continue

    const periodEndFormatted = formatDate(row.current_period_end)
    const days = daysUntil(row.current_period_end, now)
    const payload = {
      site_id: row.site_id,
      site_name: siteName,
      client_email: clientEmail,
      local_rate: row.local_rate,
      local_currency: row.local_currency,
      period_end: row.current_period_end,
      days_until_due: days,
    }

    const { html: clientHtml, text: clientText } = await useRender(CashBillingReminderClient, {
      props: {
        siteName,
        siteUrl: `https://${platformDomain}`,
        localRate: row.local_rate,
        localCurrency: row.local_currency,
        periodEnd: periodEndFormatted,
      },
    })

    await sendEmail(env, db, {
      organizationId: row.organization_id,
      siteId: row.site_id,
      recipient: clientEmail,
      subject: `Payment reminder: ${row.local_currency} ${row.local_rate.toLocaleString()} due ${periodEndFormatted}`,
      html: clientHtml,
      text: clientText,
      template: 'cash_billing_reminder_client',
      payload: { ...payload, audience: 'client' },
    })

    const { html: adminHtml, text: adminText } = await useRender(CashBillingReminderAdmin, {
      props: {
        siteName,
        clientEmail,
        adminUrl,
        localRate: row.local_rate,
        localCurrency: row.local_currency,
        periodEnd: periodEndFormatted,
        daysUntilDue: days,
      },
    })

    await Promise.all(
      adminEmails(env).map(admin =>
        sendEmail(env, db, {
          organizationId: row.organization_id,
          siteId: row.site_id,
          recipient: admin,
          subject: `[Collect] ${row.local_currency} ${row.local_rate.toLocaleString()} from ${siteName} — ${days <= 1 ? 'today' : `${days} days`}`,
          html: adminHtml,
          text: adminText,
          template: 'cash_billing_reminder_admin',
          payload: { ...payload, audience: 'admin' },
        }),
      ),
    )

    await db.prepare(`
      UPDATE site_billing SET last_reminder_sent_at = ? WHERE site_id = ?
    `).bind(now.toISOString(), row.site_id).run()

    reminded += 1
  }

  return { reminded, checked: (rows.results ?? []).length }
}
