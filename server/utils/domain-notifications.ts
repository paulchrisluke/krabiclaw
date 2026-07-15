import { useRender } from 'vue-email'
import { execute, queryFirst } from '~/server/db'
import { sendWhatsAppNotification, getOrgWhatsAppPhone } from '~/server/utils/whatsapp'
import { hashEmail, logOnlyEmailProviderId, shouldSendRealEmail } from '~/server/utils/email-delivery'
import DomainUpdate from '~/server/emails/templates/DomainUpdate'

interface DomainNotificationEnv {
  PLATFORM_OWNER_EMAILS?: string
  RESEND_API_KEY?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
  EMAIL_DELIVERY_MODE?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

interface ResendResponse {
  id?: string
}

interface DomainNotificationInput {
  organizationId: string
  siteId: string
  domain: string
  status: string
  title: string
  message: string
  dashboardUrl: string
}

function ownerEmailQuery() {
  return `
    SELECT u.email
    FROM user u
    JOIN member m ON u.id = m.userId
    WHERE m.organizationId = ? AND m.role IN ('owner', 'admin')
    ORDER BY m.role = 'owner' DESC, u.email LIKE '%@example.test' ASC, m.createdAt DESC
    LIMIT 1
  `
}

function supportEmails(env: DomainNotificationEnv): string[] {
  return String(env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

function safeDashboardUrl(raw: string): string {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported dashboard URL protocol')
    }
    return encodeURI(parsed.toString())
  } catch {
    throw new Error('Invalid dashboard URL')
  }
}

async function sendEmail(
  env: DomainNotificationEnv,
  db: D1Database,
  opts: DomainNotificationInput & { to: string; audience: 'owner' | 'support' }
) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const storedRecipient = shouldSendRealEmail(env) ? opts.to : hashEmail(opts.to)
  await execute(db, `
    INSERT INTO notifications
    (id, organization_id, site_id, channel, template, recipient, title, payload, status, created_at)
    VALUES (?, ?, ?, 'email', 'domain_update', ?, ?, ?, 'pending', ?)
  `, [
    id,
    opts.organizationId,
    opts.siteId,
    storedRecipient,
    opts.title,
    JSON.stringify({ audience: opts.audience, domain: opts.domain, status: opts.status, message: opts.message, dashboard_url: opts.dashboardUrl }),
    now
  ])

  if (!shouldSendRealEmail(env)) {
    await execute(db, `UPDATE notifications SET status = 'sent', provider_message_id = ?, sent_at = ?, error = NULL WHERE id = ?`, [
      logOnlyEmailProviderId('domain'),
      now,
      id,
    ])
    console.info('email_delivery_log_only', {
      notificationId: id,
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      audience: opts.audience,
      recipient: hashEmail(opts.to),
      title: opts.title,
      template: 'domain_update',
    })
    return
  }

  const timeoutMs = 5000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const dashboardUrl = safeDashboardUrl(opts.dashboardUrl)
  const platformDomain = (env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const { html, text } = await useRender(DomainUpdate, { props: { title: opts.title, message: opts.message, domain: opts.domain, status: opts.status, dashboardUrl, platformDomain } })

  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: 'KrabiClaw <hello@krabiclaw.com>',
        to: [opts.to],
        subject: opts.title,
        html,
        text,
      })
    })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    const message = normalizedError.name === 'AbortError'
      ? `Email request timed out after ${timeoutMs}ms`
      : `Email request failed: ${normalizedError.message || 'Unknown error'}`
    console.error('domain_notification_email_send_failed', {
      to: hashEmail(opts.to),
      audience: opts.audience,
      siteId: opts.siteId,
      organizationId: opts.organizationId,
      error: message,
    })
    await execute(db, `UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`, [message, now, id])
    return
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    let error: string
    try {
      error = await response.text()
    } catch {
      error = `HTTP ${response.status}`
    }
    await execute(db, `UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`, [error, now, id])
    return
  }

  let data: ResendResponse | null = null
  try {
    data = await response.clone().json() as ResendResponse
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    const raw = await response.text().catch(() => '<unavailable>')
    console.error('domain_notification_email_response_parse_failed', {
      to: hashEmail(opts.to),
      audience: opts.audience,
      status: response.status,
      error: normalizedError.message,
      raw,
    })
    data = null
  }
  await execute(db, `UPDATE notifications SET status = 'sent', provider_message_id = ?, sent_at = ? WHERE id = ?`, [data?.id ?? null, now, id])
}

export async function notifyDomainLifecycle(
  env: DomainNotificationEnv,
  db: D1Database,
  opts: DomainNotificationInput
) {
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO notifications
    (id, organization_id, site_id, channel, template, title, payload, status, sent_at, created_at)
    VALUES (?, ?, ?, 'dashboard', 'domain_update', ?, ?, 'sent', ?, ?)
  `, [
    crypto.randomUUID(),
    opts.organizationId,
    opts.siteId,
    opts.title,
    JSON.stringify({ domain: opts.domain, status: opts.status, message: opts.message, dashboard_url: opts.dashboardUrl }),
    now,
    now
  ])

  if (env.RESEND_API_KEY || !shouldSendRealEmail(env)) {
    const owner = await queryFirst<{ email?: string }>(db, ownerEmailQuery(), [opts.organizationId])
    if (owner?.email) await sendEmail(env, db, { ...opts, to: owner.email, audience: 'owner' })
    const supportSendPromises = supportEmails(env).map((email) => sendEmail(env, db, { ...opts, to: email, audience: 'support' }))
    await Promise.all(supportSendPromises)
  }

  const phone = await getOrgWhatsAppPhone(db, opts.organizationId, opts.siteId)
  if (phone) {
    try {
      await sendWhatsAppNotification(env, db, {
        organizationId: opts.organizationId,
        siteId: opts.siteId,
        toPhone: phone,
        template: 'domain_update',
        vars: {
          domain: opts.domain,
          status: opts.status,
          dashboard_url: opts.dashboardUrl
        }
      })
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Unknown error')
      console.error('domain_notification_whatsapp_send_failed', {
        organizationId: opts.organizationId,
        siteId: opts.siteId,
        domain: opts.domain,
        status: opts.status,
        error: normalizedError.message
      })
    }
  }
}
