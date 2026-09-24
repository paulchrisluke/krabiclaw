import { renderNotificationEmail } from '~/server/emails/render'
import { domainUpdateMessage } from '~/server/notifications/events'
import { toWhatsAppVars } from '~/server/notifications/whatsapp-mapping'
import type { DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { sendEmail } from '~/server/utils/email-delivery'
import { listOrganizationNotificationMembers } from '~/server/utils/member-access'
import { wantsNotification } from '~/server/domain/notification-preferences'
import { buildUnsubscribeUrls } from '~/server/utils/unsubscribe'
import { createCanonicalNotification } from '~/server/utils/notification-center'
import { sendWhatsAppNotification } from '~/server/utils/whatsapp'

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
    scope: 'organization',
    severity: opts.status === 'active' ? 'success' : 'warning',
    organizationId: opts.organizationId,
    title: opts.title,
    message: opts.message,
    deepLink: dashboardUrl,
    template: 'domain_update',
  })

  const configuredPlatformDomain = env.NUXT_PUBLIC_PLATFORM_DOMAIN?.trim()
  if (!configuredPlatformDomain) throw new Error('NUXT_PUBLIC_PLATFORM_DOMAIN is required')
  const platformDomain = configuredPlatformDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const message = domainUpdateMessage({
    headline: opts.title,
    message: opts.message,
    domain: opts.domain,
    status: opts.status,
    dashboardUrl,
  })
  // Each member is asked whether they want site-and-billing mail; the platform
  // support addresses are operational routing, not a person's preference, so
  // they are always copied and carry no unsubscribe link.
  const members = await listOrganizationNotificationMembers(env, opts.organizationId)
  const memberRecipients = (await Promise.all(members.map(async (member) => {
    if (!await wantsNotification(db, member.userId, 'site_and_billing', 'email')) return null
    const unsubscribe = await buildUnsubscribeUrls(env, { userId: member.userId, category: 'site_and_billing' })
    return { to: member.email, unsubscribeUrl: unsubscribe?.pageUrl ?? null, unsubscribeOneClickUrl: unsubscribe?.oneClickUrl ?? null }
  }))).filter((recipient): recipient is { to: string; unsubscribeUrl: string | null; unsubscribeOneClickUrl: string | null } => recipient !== null)
  const memberAddresses = new Set(memberRecipients.map(recipient => recipient.to))
  const recipients: Array<{ to: string; unsubscribeUrl: string | null; unsubscribeOneClickUrl: string | null }> = [
    ...memberRecipients,
    ...[...new Set(supportEmails(env))]
      .filter(address => !memberAddresses.has(address))
      .map(to => ({ to, unsubscribeUrl: null, unsubscribeOneClickUrl: null })),
  ]
  const emailResults = await Promise.all(recipients.map(async recipient => sendEmail(env, {
    to: recipient.to,
    subject: opts.title,
    ...(await renderNotificationEmail(message, {
      platformDomain,
      preferencesUrl: `https://${platformDomain}/dashboard/account/profile/notifications`,
      unsubscribeUrl: recipient.unsubscribeUrl,
    })),
    unsubscribeOneClickUrl: recipient.unsubscribeOneClickUrl,
  })))
  const failedEmails = emailResults.filter(result => result.status !== 'sent')

  // Same recipients, same preferences, the other channel. This used to send to
  // the organization's configured number, asking neither whose account it was
  // nor whether that person wanted site-and-billing messages.
  const whatsappResults = await Promise.all(members.map(async (member) => {
    if (!member.phone) return null
    if (!await wantsNotification(db, member.userId, 'site_and_billing', 'whatsapp')) return null
    return await sendWhatsAppNotification(env, {
      organizationId: opts.organizationId,
      toPhone: member.phone,
      template: 'domain_update',
      vars: toWhatsAppVars(message, 'domain_update').vars,
    })
  }))
  const failedWhatsApp = whatsappResults.filter(result => result && !result.success)
  const failures = [
    ...failedEmails.map(result => `email: ${result.error ?? result.status}`),
    ...failedWhatsApp.map(result => `whatsapp: ${result && !result.success ? result.error : 'unknown'}`),
  ]
  if (failures.length) {
    throw new Error(`Domain notification was not delivered for organization ${opts.organizationId} — ${failures.join('; ')}`)
  }
}
