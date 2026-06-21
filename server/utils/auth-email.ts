import { useRender } from 'vue-email'
import { shouldSendRealEmail } from '~/server/utils/email-delivery'
import AuthResetPassword from '~/server/emails/templates/AuthResetPassword'
import AuthVerifyEmail from '~/server/emails/templates/AuthVerifyEmail'

export interface AuthEmailEnv {
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  EMAIL_DELIVERY_MODE?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

function platformDomain(env: AuthEmailEnv): string {
  return (env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
}

async function sendAuthEmail(
  env: AuthEmailEnv,
  opts: {
    to: string
    subject: string
    html: string
    text: string
  },
) {
  if (!shouldSendRealEmail(env)) {
    console.info('auth_email_log_only', {
      to: opts.to,
      subject: opts.subject,
    })
    return
  }

  if (!env.RESEND_API_KEY) {
    console.warn('auth_email_skipped_missing_resend', {
      to: opts.to,
      subject: opts.subject,
    })
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'KrabiClaw <hello@krabiclaw.com>',
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Resend auth email failed: ${response.status} ${body}`)
  }
}

export async function sendPasswordResetEmail(
  env: AuthEmailEnv,
  opts: { email: string, resetUrl: string },
) {
  const currentPlatformDomain = platformDomain(env)
  const { html, text } = await useRender(AuthResetPassword, {
    props: {
      resetUrl: opts.resetUrl,
      platformDomain: currentPlatformDomain,
    },
  })

  await sendAuthEmail(env, {
    to: opts.email,
    subject: 'Reset your KrabiClaw password',
    html,
    text,
  })
}

export async function sendVerificationEmail(
  env: AuthEmailEnv,
  opts: { email: string, verificationUrl: string },
) {
  const currentPlatformDomain = platformDomain(env)
  const { html, text } = await useRender(AuthVerifyEmail, {
    props: {
      verificationUrl: opts.verificationUrl,
      platformDomain: currentPlatformDomain,
    },
  })

  await sendAuthEmail(env, {
    to: opts.email,
    subject: 'Verify your KrabiClaw email',
    html,
    text,
  })
}
