import { renderNotificationEmail } from '~/server/emails/render'
import { domainUpdateMessage } from '~/server/notifications/events'
import { toWhatsAppVars } from '~/server/notifications/whatsapp-mapping'
import type { DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { sendEmail } from '~/server/utils/email-delivery'
import { getOrganizationOwnerRecipient, resolveAuthorizedWhatsAppRecipient } from '~/server/utils/member-access'
import { wantsNotification } from '~/server/domain/notification-preferences'
import { buildUnsubscribeUrls } from '~/server/utils/unsubscribe'
import { createCanonicalNotification } from '~/server/utils/notification-center'
import { getOrgWhatsAppPhone, sendWhatsAppNotification } from '~/server/utils/whatsapp'

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
  // The owner is asked whether they want site-and-billing mail; the platform
  // support addresses are operational routing, not a person's preference, so
  // they are always copied and carry no unsubscribe link.
  const owner = await getOrganizationOwnerRecipient(env, opts.organizationId)
  const ownerWantsEmail = owner ? await wantsNotification(db, owner.userId, 'site_and_billing', 'email') : false
  const ownerUnsubscribe = owner && ownerWantsEmail
    ? await buildUnsubscribeUrls(env, { userId: owner.userId, category: 'site_and_billing' })
    : null
  const recipients: Array<{ to: string; unsubscribeUrl: string | null; unsubscribeOneClickUrl: string | null }> = [
    ...(owner && ownerWantsEmail ? [{ to: owner.email, unsubscribeUrl: ownerUnsubscribe?.pageUrl ?? null, unsubscribeOneClickUrl: ownerUnsubscribe?.oneClickUrl ?? null }] : []),
    ...[...new Set(supportEmails(env))]
      .filter(address => address !== owner?.email)
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
  emailResults.forEach((result) => {
    if (result.status !== 'sent') console.error('domain_notification_email_send_failed', { organizationId: opts.organizationId, error: result.error })
  })

  // Gated like every other owner alert. This send used to go straight to the
  // site's number: it asked neither whether the account behind it wants
  // site-and-billing mail nor whether that number is allowed to receive
  // anything for this organization, so a tenant who switched the category off
  // still got the WhatsApp.
  const phone = await getOrgWhatsAppPhone(db, opts.organizationId)
  if (phone) {
    const recipient = await resolveAuthorizedWhatsAppRecipient(db, {
      env,
      phone,
      organizationId: opts.organizationId,
      locationId: null,
      requireOrganizationWide: true,
    })
    const wanted = recipient ? await wantsNotification(db, recipient.userId, 'site_and_billing', 'whatsapp') : false
    if (!recipient) {
      console.error('whatsapp_delivery_blocked', { organizationId: opts.organizationId, reason: 'recipient_access_pending' })
    } else if (wanted) {
      const result = await sendWhatsAppNotification(env, {
        organizationId: opts.organizationId,
        toPhone: phone,
        template: 'domain_update',
        vars: toWhatsAppVars(message, 'domain_update').vars,
      })
      if (!result.success) console.error('domain_notification_whatsapp_send_failed', { organizationId: opts.organizationId, error: result.error })
    }
  }
}
