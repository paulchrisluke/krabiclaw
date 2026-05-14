import { sendWhatsAppNotification, getOrgWhatsAppPhone } from '~/server/utils/whatsapp'

interface DomainNotificationEnv {
  PLATFORM_OWNER_EMAILS?: string
  RESEND_API_KEY?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
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
    ORDER BY m.role = 'owner' DESC, m.createdAt ASC
    LIMIT 1
  `
}

function supportEmails(env: DomainNotificationEnv): string[] {
  return String(env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  await db.prepare(`
    INSERT INTO notifications
    (id, organization_id, site_id, channel, template, recipient, title, payload, status, created_at)
    VALUES (?, ?, ?, 'email', 'domain_update', ?, ?, ?, 'pending', ?)
  `).bind(
    id,
    opts.organizationId,
    opts.siteId,
    opts.to,
    opts.title,
    JSON.stringify({ audience: opts.audience, domain: opts.domain, status: opts.status, message: opts.message, dashboard_url: opts.dashboardUrl }),
    now
  ).run()

  const timeoutMs = 5000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    const dashboardUrl = safeDashboardUrl(opts.dashboardUrl)
    const escapedDashboardUrl = escapeHtml(dashboardUrl)
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
        html: `
        <p>${escapeHtml(opts.message)}</p>
        <p><strong>Domain:</strong> ${escapeHtml(opts.domain)}</p>
        <p><strong>Status:</strong> ${escapeHtml(opts.status)}</p>
        <p><a href="${escapedDashboardUrl}">Open domain settings</a></p>
      `
      })
    })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    const message = normalizedError.name === 'AbortError'
      ? `Email request timed out after ${timeoutMs}ms`
      : `Email request failed: ${normalizedError.message || 'Unknown error'}`
    console.error('domain_notification_email_send_failed', {
      to: opts.to,
      audience: opts.audience,
      siteId: opts.siteId,
      organizationId: opts.organizationId,
      error: message,
    })
    await db.prepare(`UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`).bind(message, now, id).run()
    return
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const error = await response.text()
    await db.prepare(`UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`).bind(error, now, id).run()
    return
  }

  let data: ResendResponse | null = null
  try {
    data = await response.clone().json() as ResendResponse
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    const raw = await response.text().catch(() => '<unavailable>')
    console.error('domain_notification_email_response_parse_failed', {
      to: opts.to,
      audience: opts.audience,
      status: response.status,
      error: normalizedError.message,
      raw,
    })
    data = null
  }
  await db.prepare(`UPDATE notifications SET status = 'sent', provider_message_id = ?, sent_at = ? WHERE id = ?`).bind(data?.id ?? null, now, id).run()
}

export async function notifyDomainLifecycle(
  env: DomainNotificationEnv,
  db: D1Database,
  opts: DomainNotificationInput
) {
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO notifications
    (id, organization_id, site_id, channel, template, title, payload, status, sent_at, created_at)
    VALUES (?, ?, ?, 'dashboard', 'domain_update', ?, ?, 'sent', ?, ?)
  `).bind(
    crypto.randomUUID(),
    opts.organizationId,
    opts.siteId,
    opts.title,
    JSON.stringify({ domain: opts.domain, status: opts.status, message: opts.message, dashboard_url: opts.dashboardUrl }),
    now,
    now
  ).run()

  if (env.RESEND_API_KEY) {
    const owner = await db.prepare(ownerEmailQuery()).bind(opts.organizationId).first() as { email?: string } | null
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
