import { useRender } from 'vue-email'
import { shouldSendRealEmail } from '~/server/utils/email-delivery'
import AdminNewSignup from '~/server/emails/templates/AdminNewSignup'

interface AdminNotificationEnv {
  PLATFORM_OWNER_EMAILS?: string
  RESEND_API_KEY?: string
  EMAIL_DELIVERY_MODE?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

function supportEmails(env: AdminNotificationEnv): string[] {
  return String(env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
}

export async function notifyAdminNewUserSignup(
  env: AdminNotificationEnv,
  user: { id: string; name?: string | null; email: string; createdAt?: string },
): Promise<void> {
  // Skip phone/WhatsApp synthetic accounts
  if (user.email.endsWith('@phone.krabiclaw.local')) return

  const recipients = supportEmails(env)
  if (!recipients.length) return
  if (shouldSendRealEmail(env) && !env.RESEND_API_KEY) return


  const displayName = user.name || user.email
  const signedUpAt = user.createdAt ? new Date(user.createdAt).toUTCString() : new Date().toUTCString()
  const platformDomain = (env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const adminUrl = `https://${platformDomain}/admin`

  const { html, text } = await useRender(AdminNewSignup, { props: { displayName, email: user.email, signedUpAt, adminUrl } })

  if (!shouldSendRealEmail(env)) {
    console.info('admin_notification_log_only', { event: 'new_user_signup', email: user.email })
    return
  }

  if (!env.RESEND_API_KEY) return

  await Promise.all(
    recipients.map((to) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'KrabiClaw <hello@krabiclaw.com>',
          to: [to],
          subject: `New sign-up: ${displayName}`,
          html,
          text,
        }),
      }).catch((err) => console.error('admin_signup_notification_failed', err)),
    ),
  )
}
