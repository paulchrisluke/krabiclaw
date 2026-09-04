import { renderEmail } from '~/server/emails/vue-email'
import type { DbClient } from '~/server/db'
import { sendEmail } from '~/server/utils/email-delivery'
import { createCanonicalNotification, NOTIFICATION_EVENT_TYPES } from '~/server/utils/notification-center'
import type { GuestInboxPublicationEnv } from '~/server/cloudflare/guest-inbox-events'
import SiteTransferReminder from '~/server/emails/templates/SiteTransferReminder'

interface SiteTransferNotificationEnv extends GuestInboxPublicationEnv {
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
    .map(email => email.trim())
    .filter(Boolean)
}

export async function notifySiteTransferReminder(
  env: SiteTransferNotificationEnv,
  db: DbClient,
  opts: ReminderInput,
) {
  const title = opts.customDomainsPaused
    ? `Action needed: Finishing touches for ${opts.siteName}`
    : `Reminder: ${opts.siteName} is ready for you!`
  const body = opts.customDomainsPaused
    ? 'Your website is ready, but payment setup must be completed before its custom domain can go live.'
    : 'Your new website is ready. Review and claim it when you are ready.'
  const payload = {
    site_name: opts.siteName,
    transfer_url: opts.transferUrl,
    invited_plan: opts.invitedPlan,
    invited_domain: opts.invitedDomain,
    days_pending: opts.daysPending,
    custom_domains_paused: opts.customDomainsPaused,
  }

  await createCanonicalNotification(db, {
    publishEnv: env,
    scope: 'site',
    eventType: NOTIFICATION_EVENT_TYPES.SITE_TRANSFER_REMINDER,
    severity: opts.customDomainsPaused ? 'warning' : 'info',
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    title,
    message: body,
    deepLink: opts.transferUrl,
    payload,
    template: 'site_transfer_reminder',
  })

  const planLabel: Record<string, string> = { growth: 'Growth ($49/mo)' }
  const configuredPlatformDomain = env.NUXT_PUBLIC_PLATFORM_DOMAIN?.trim()
  if (!configuredPlatformDomain) throw new Error('NUXT_PUBLIC_PLATFORM_DOMAIN is required')
  const platformDomain = configuredPlatformDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const rendered = await renderEmail(SiteTransferReminder, {
    siteName: opts.siteName,
    transferUrl: opts.transferUrl,
    domain: opts.invitedDomain,
    planLabel: opts.invitedPlan ? (planLabel[opts.invitedPlan] ?? 'Unsupported plan') : null,
    customDomainsPaused: opts.customDomainsPaused,
    platformDomain,
  })
  const recipients = [...new Set([opts.toEmail, ...supportEmails(env)])]
  const results = await Promise.all(recipients.map(recipient => sendEmail(env, {
    to: recipient,
    subject: recipient === opts.toEmail ? title : `[Admin] ${title}`,
    html: rendered.html,
    text: rendered.text,
  })))
  results.forEach((result) => {
    if (result.status !== 'sent') console.error('site_transfer_reminder_email_failed', { siteId: opts.siteId, error: result.error })
  })
}
