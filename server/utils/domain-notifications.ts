import { renderEmail } from '~/server/emails/vue-email'
import type { DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { sendEmail } from '~/server/utils/email-delivery'
import { getOrganizationOwnerEmail } from '~/server/utils/member-access'
import { createCanonicalNotification } from '~/server/utils/notification-center'
import { getOrgWhatsAppPhone, sendWhatsAppNotification } from '~/server/utils/whatsapp'
import DomainUpdate from '~/server/emails/templates/DomainUpdate'

interface DomainNotificationEnv extends CloudflareEnv {
  PLATFORM_OWNER_EMAILS?: string
  RESEND_API_KEY?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
  EMAIL_DELIVERY_MODE?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
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

function supportEmails(env: DomainNotificationEnv): string[] {
  return String(env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map(email => email.trim())
    .filter(Boolean)
}

function safeDashboardUrl(raw: string): string {
  const parsed = new URL(raw)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported dashboard URL protocol')
  }
  return encodeURI(parsed.toString())
}

export async function notifyDomainLifecycle(
  env: DomainNotificationEnv,
  db: DbClient,
  opts: DomainNotificationInput,
) {
  const dashboardUrl = safeDashboardUrl(opts.dashboardUrl)
  await createCanonicalNotification(db, {
    publishEnv: env,
    scope: 'site',
    severity: opts.status === 'active' ? 'success' : 'warning',
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    title: opts.title,
    message: opts.message,
    deepLink: dashboardUrl,
    template: 'domain_update',
  })

  const configuredPlatformDomain = env.NUXT_PUBLIC_PLATFORM_DOMAIN?.trim()
  if (!configuredPlatformDomain) throw new Error('NUXT_PUBLIC_PLATFORM_DOMAIN is required')
  const platformDomain = configuredPlatformDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const rendered = await renderEmail(DomainUpdate, {
    title: opts.title,
    message: opts.message,
    domain: opts.domain,
    status: opts.status,
    dashboardUrl,
    platformDomain,
  })
  const ownerEmail = await getOrganizationOwnerEmail(env, opts.organizationId)
  const recipients = [...new Set([ownerEmail, ...supportEmails(env)].filter(Boolean))] as string[]
  const emailResults = await Promise.all(recipients.map(to => sendEmail(env, {
    to,
    subject: opts.title,
    html: rendered.html,
    text: rendered.text,
  })))
  emailResults.forEach((result) => {
    if (result.status !== 'sent') console.error('domain_notification_email_send_failed', { siteId: opts.siteId, error: result.error })
  })

  const phone = await getOrgWhatsAppPhone(db, opts.organizationId, opts.siteId)
  if (phone) {
    const result = await sendWhatsAppNotification(env, db, {
      organizationId: opts.organizationId,
      siteId: opts.siteId,
      toPhone: phone,
      template: 'domain_update',
      vars: { domain: opts.domain, status: opts.status, dashboard_url: dashboardUrl },
    })
    if (!result.success && result.status === 'sent') {
      console.error('domain_notification_whatsapp_accounting_failed', { siteId: opts.siteId, error: result.error })
      throw new Error(result.error)
    }
    if (!result.success) console.error('domain_notification_whatsapp_send_failed', { siteId: opts.siteId, error: result.error })
  }
}
