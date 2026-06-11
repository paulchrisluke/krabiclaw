export type EmailDeliveryMode = 'provider' | 'log_only'

type EmailDeliveryEnv = {
  EMAIL_DELIVERY_MODE?: string
}

export function getEmailDeliveryMode(env: EmailDeliveryEnv | null | undefined | unknown): EmailDeliveryMode {
  const mode = typeof env === 'object' && env !== null && 'EMAIL_DELIVERY_MODE' in env
    ? (env as { EMAIL_DELIVERY_MODE?: string }).EMAIL_DELIVERY_MODE
    : undefined
  const raw = String(mode || '').trim().toLowerCase()
  return raw === 'log_only' ? 'log_only' : 'provider'
}

export function shouldSendRealEmail(env: EmailDeliveryEnv | null | undefined | unknown): boolean {
  return getEmailDeliveryMode(env) === 'provider'
}

export function logOnlyEmailProviderId(prefix = 'email'): string {
  return `log-only:${prefix}:${crypto.randomUUID()}`
}
