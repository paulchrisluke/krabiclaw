export type WhatsAppDeliveryMode = 'provider' | 'log_only'

type WhatsAppDeliveryEnv = {
  WHATSAPP_DELIVERY_MODE?: string
}

// Fails closed, same rationale as getEmailDeliveryMode in email-delivery.ts: an
// unset/blank/invalid WHATSAPP_DELIVERY_MODE must never fall through to real sends.
export function getWhatsAppDeliveryMode(env: WhatsAppDeliveryEnv | null | undefined | unknown): WhatsAppDeliveryMode {
  const mode = typeof env === 'object' && env !== null && 'WHATSAPP_DELIVERY_MODE' in env
    ? (env as { WHATSAPP_DELIVERY_MODE?: string }).WHATSAPP_DELIVERY_MODE
    : undefined
  const raw = String(mode || '').trim().toLowerCase()
  if (!raw) return 'log_only'

  const normalized = raw.replace(/[-_]/g, '')
  if (normalized === 'logonly') return 'log_only'
  if (normalized === 'provider') return 'provider'

  console.warn('[whatsapp-delivery] Invalid WHATSAPP_DELIVERY_MODE value; defaulting to log_only', {
    WHATSAPP_DELIVERY_MODE: raw,
  })
  return 'log_only'
}

export function shouldSendRealWhatsApp(env: WhatsAppDeliveryEnv | null | undefined | unknown): boolean {
  return getWhatsAppDeliveryMode(env) === 'provider'
}

export function logOnlyWhatsAppMessageId(prefix = 'whatsapp'): string {
  return `log-only:${prefix}:${crypto.randomUUID()}`
}
