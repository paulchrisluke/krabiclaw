import { createHash } from 'node:crypto'

export type EmailDeliveryMode = 'provider' | 'log_only'

type EmailDeliveryEnv = {
  EMAIL_DELIVERY_MODE?: string
}

export function getEmailDeliveryMode(env: EmailDeliveryEnv | null | undefined | unknown): EmailDeliveryMode {
  const mode = typeof env === 'object' && env !== null && 'EMAIL_DELIVERY_MODE' in env
    ? (env as { EMAIL_DELIVERY_MODE?: string }).EMAIL_DELIVERY_MODE
    : undefined
  const raw = String(mode || '').trim().toLowerCase()
  if (!raw) return 'provider'

  const normalized = raw.replace(/[-_]/g, '')
  if (normalized === 'logonly') return 'log_only'
  if (normalized === 'provider') return 'provider'

  console.warn('[email-delivery] Invalid EMAIL_DELIVERY_MODE value; defaulting to provider', {
    EMAIL_DELIVERY_MODE: raw,
  })
  return 'provider'
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
}

export function shouldSendRealEmail(env: EmailDeliveryEnv | null | undefined | unknown): boolean {
  return getEmailDeliveryMode(env) === 'provider'
}

export function logOnlyEmailProviderId(prefix = 'email'): string {
  return `log-only:${prefix}:${crypto.randomUUID()}`
}
