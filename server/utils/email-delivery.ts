import { createHash } from 'node:crypto'

export type EmailDeliveryMode = 'provider' | 'log_only'

type EmailDeliveryEnv = {
  EMAIL_DELIVERY_MODE?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
}

export type EmailSendResult =
  | { status: 'sent'; messageId: string | null }
  | { status: 'failed'; error: string }
  | { status: 'unknown'; error: string }

// Fails closed: an unset/blank/invalid EMAIL_DELIVERY_MODE must never fall through to
// real sends. Production is the only environment that should send real email, and it does
// so by setting EMAIL_DELIVERY_MODE="provider" explicitly in wrangler.toml's top-level
// [vars] — every other environment (local dev, preview, staging) either sets
// "log_only" explicitly or is protected by this default if the var is ever missing.
// See the 2026-07 incident: this used to default to 'provider', so any environment that
// forgot to set the var (or a local .env with a real RESEND_API_KEY) sent real Resend email
// to seeded e2e fixture addresses like user-mcp-growth@example.test, bouncing and burning
// sending-domain reputation.
export function getEmailDeliveryMode(env: EmailDeliveryEnv | null | undefined | unknown): EmailDeliveryMode {
  // `nuxt dev` reads wrangler.toml's top-level [vars] — the same block
  // `wrangler deploy` (no --env) uses for production — so a local dev session
  // inherits EMAIL_DELIVERY_MODE=provider from the production config. Hard-stop
  // local development at the code level instead of depending on local config.
  if (import.meta.dev) return 'log_only'
  const mode = typeof env === 'object' && env !== null && 'EMAIL_DELIVERY_MODE' in env
    ? (env as { EMAIL_DELIVERY_MODE?: string }).EMAIL_DELIVERY_MODE
    : undefined
  const raw = String(mode || '').trim().toLowerCase()
  if (!raw) return 'log_only'

  const normalized = raw.replace(/[-_]/g, '')
  if (normalized === 'logonly') return 'log_only'
  if (normalized === 'provider') return 'provider'

  console.warn('[email-delivery] Invalid EMAIL_DELIVERY_MODE value; defaulting to log_only', {
    EMAIL_DELIVERY_MODE: raw,
  })
  return 'log_only'
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

// RFC 2606 reserves .test/.example/.invalid (plus .localhost) as non-resolvable, always-fake
// domains for documentation/testing — a real mailbox can never exist there, so any send here
// is guaranteed to hard-bounce. Checked as defense-in-depth in addition to EMAIL_DELIVERY_MODE:
// even if delivery mode is ever misconfigured back to "provider" in an environment seeded with
// e2e/demo fixture addresses (e.g. user-mcp-growth@example.test), this stops the bounce before
// it reaches Resend.
const RESERVED_TEST_TLDS = new Set(['test', 'example', 'invalid', 'localhost'])

// RFC 2606 also reserves these exact second-level domains under otherwise-real TLDs
// (example.com/net/org) — these are the ones actually seen bouncing in production
// (wa-verify@example.com, verify-guest@example.com), since their TLD is "com", not "example".
const RESERVED_TEST_DOMAINS = new Set(['example.com', 'example.net', 'example.org'])

export function isReservedTestDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1]
  if (!domain) return false
  if (RESERVED_TEST_DOMAINS.has(domain)) return true
  const tld = domain.split('.').pop() ?? ''
  if (RESERVED_TEST_TLDS.has(tld)) return true
  // Check for subdomains under reserved roots (e.g., mail.example.com, wa-verify.example.com)
  for (const reservedDomain of RESERVED_TEST_DOMAINS) {
    if (domain === reservedDomain || domain.endsWith(`.${reservedDomain}`)) return true
  }
  return false
}

export async function sendEmail(
  env: EmailDeliveryEnv,
  input: {
    to: string
    subject: string
    text: string
    html?: string
    replyTo?: string | null
    fromName?: string
    idempotencyKey?: string
  },
): Promise<EmailSendResult> {
  if (!shouldSendRealEmail(env) || isReservedTestDomain(input.to)) {
    return { status: 'sent', messageId: logOnlyEmailProviderId('email') }
  }
  if (!env.RESEND_API_KEY) return { status: 'failed', error: 'RESEND_API_KEY not configured' }

  const configuredFrom = env.EMAIL_FROM || 'KrabiClaw <hello@krabiclaw.com>'
  const from = input.fromName
    ? configuredFrom.includes('<')
      ? configuredFrom.replace(/^[^<]*(?=<)/, `${input.fromName} `)
      : `${input.fromName} <${configuredFrom}>`
    : configuredFrom
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        ...(input.html ? { html: input.html } : {}),
        text: input.text,
      }),
      signal: controller.signal,
    })

    if (!response.ok) return { status: 'failed', error: await response.text() }
    const data = await response.json().catch(() => ({})) as { id?: string }
    return { status: 'sent', messageId: data.id ?? null }
  } catch (error) {
    return {
      status: 'unknown',
      error: error instanceof Error ? error.message : 'Email request failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}
