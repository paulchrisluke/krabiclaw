// Meta Cloud API — WhatsApp Business send-only notifications.
// All messages use pre-approved templates (WhatsApp requires this for business-initiated messages).
// Phone numbers stored and sent in E.164 format (+66946230215).

const GRAPH_API_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

interface WhatsAppEnv {
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
  MAX_WHATSAPP_MEDIA_BYTES?: string
}

const DEFAULT_MAX_WHATSAPP_MEDIA_BYTES = 20 * 1024 * 1024
const DEFAULT_DASHBOARD_URL = 'https://krabiclaw.com/dashboard'

interface MetaGraphErrorPayload {
  message?: string
}

interface MetaGraphMessagePayload {
  id?: string
}

interface MetaGraphResponse {
  error?: MetaGraphErrorPayload
  messages?: MetaGraphMessagePayload[]
}

interface MetaMediaResponse {
  url?: string
  mime_type?: string
  sha256?: string
  file_size?: number
  id?: string
  error?: MetaGraphErrorPayload
}

export type WhatsAppTemplate =
  | 'new_review'
  | 'ai_action_complete'
  | 'low_credits'
  | 'new_contact_msg'
  | 'new_reservation'
  | 'reservation_cancelled'
  | 'domain_update'
  | 'otp_code'

interface TemplateBodyComponent {
  type: 'body'
  parameters: Array<{ type: 'text'; text: string }>
}

interface TemplateButtonComponent {
  type: 'button'
  sub_type: 'url'
  index: string
  parameters: Array<{ type: 'text'; text: string }>
}

type TemplateComponent = TemplateBodyComponent | TemplateButtonComponent

function cleanTemplateText(value: string | undefined, fallback: string, maxLen = 120): string {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (raw) return raw.slice(0, maxLen)
  // Process fallback the same way so returned string respects maxLen
  const fb = String(fallback ?? '').replace(/\s+/g, ' ').trim()
  return fb.slice(0, maxLen)
}

function normalizeTemplateVars(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(vars)) {
    out[key] = String(val ?? '').replace(/\s+/g, ' ').trim()
  }
  return out
}

// Map our template names to Meta template names + variable builders.
// Meta template names must match exactly what was approved in Business Manager.
const TEMPLATES: Record<
  WhatsAppTemplate,
  (_vars: Record<string, string>) => { name: string; language: { code: string }; components: TemplateComponent[] }
> = {
  new_review: (v) => ({
    name: 'new_review',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.rating ?? '5' },
        { type: 'text', text: v.site_name ?? 'your site' },
        { type: 'text', text: cleanTemplateText(v.excerpt, 'Open dashboard for full review.', 100) },
      ],
    }],
  }),
  ai_action_complete: (v) => ({
    name: 'ai_action_complete',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: cleanTemplateText(v.action_summary, 'AI task completed') },
        { type: 'text', text: cleanTemplateText(v.preview_url, DEFAULT_DASHBOARD_URL, 200) },
      ],
    }],
  }),
  low_credits: (v) => ({
    name: 'low_credits',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: cleanTemplateText(v.credits_remaining, '0', 32) },
        { type: 'text', text: cleanTemplateText(v.upgrade_url, DEFAULT_DASHBOARD_URL, 200) },
      ],
    }],
  }),
  new_contact_msg: (v) => ({
    name: 'new_contact_msg',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: cleanTemplateText(v.guest_name, 'Guest') },
        { type: 'text', text: cleanTemplateText(v.email, 'No email provided', 120) },
        { type: 'text', text: cleanTemplateText(v.message_preview, 'No message preview', 100) },
      ],
    }],
  }),
  new_reservation: (v) => ({
    name: 'new_reservation',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: cleanTemplateText(v.guest_name, 'Guest') },
        { type: 'text', text: cleanTemplateText(v.date, 'Date pending', 40) },
        { type: 'text', text: cleanTemplateText(v.time, 'Time pending', 40) },
        { type: 'text', text: cleanTemplateText(v.guests, 'Unknown', 24) },
        { type: 'text', text: cleanTemplateText(v.phone, 'No phone provided', 40) },
      ],
    }],
  }),
  reservation_cancelled: (v) => ({
    name: 'reservation_cancelled',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: cleanTemplateText(v.guest_name, 'Guest') },
        { type: 'text', text: cleanTemplateText(v.date, 'Date pending', 40) },
        { type: 'text', text: cleanTemplateText(v.time, 'Time pending', 40) },
        { type: 'text', text: cleanTemplateText(v.guests, 'Unknown', 24) },
        { type: 'text', text: cleanTemplateText(v.phone, 'No phone provided', 40) },
      ],
    }],
  }),
  domain_update: (v) => ({
    name: 'domain_update',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: cleanTemplateText(v.domain, 'your domain', 120) },
        { type: 'text', text: cleanTemplateText(v.status, 'updated', 40) },
        { type: 'text', text: cleanTemplateText(v.dashboard_url, DEFAULT_DASHBOARD_URL, 200) },
      ],
    }],
  }),
  otp_code: (v) => ({
    name: 'otp_code',
    language: { code: 'en_US' },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cleanTemplateText(v.code, '', 12) },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [
          { type: 'text', text: cleanTemplateText(v.code, '', 12) },
        ],
      },
    ],
  }),
}

/** Normalize any phone number to E.164. Assumes Thailand if no country code. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length >= 9) return `+66${digits.slice(1)}`
  if (digits.startsWith('66') && digits.length >= 11) return `+${digits}`
  if (digits.length >= 10) return `+${digits}`
  throw new Error(`Invalid phone number: ${phone}`)
}

export interface SendWhatsAppResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send a WhatsApp template message and log it to the notifications table.
 * Returns immediately — does not retry on failure.
 */
export async function sendWhatsAppNotification(
  env: WhatsAppEnv,
  db: D1Database,
  opts: {
    organizationId: string
    siteId?: string | null
    toPhone: string            // raw phone, will be normalized
    template: WhatsAppTemplate
    vars?: Record<string, string>
  }
): Promise<SendWhatsAppResult> {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = env.WHATSAPP_ACCESS_TOKEN

  const notificationId = crypto.randomUUID()
  const now = new Date().toISOString()
  const normalizedPhone = normalizePhone(opts.toPhone)
  const vars = normalizeTemplateVars(opts.vars ?? {})

  // Insert pending row first so we always have a record even if the send fails
  await db.prepare(`
    INSERT INTO notifications (id, organization_id, site_id, channel, template, payload, status, created_at)
    VALUES (?, ?, ?, 'whatsapp', ?, ?, 'pending', ?)
  `).bind(
    notificationId,
    opts.organizationId,
    opts.siteId ?? null,
    opts.template,
    JSON.stringify({ to: normalizedPhone, ...vars }),
    now
  ).run()

  if (!phoneNumberId || !accessToken) {
    await db.prepare(
      `UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`
    ).bind('WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not configured', now, notificationId).run()
    return { success: false, error: 'WhatsApp env vars not configured' }
  }

  const templatePayload = TEMPLATES[opts.template](vars)

  let result: SendWhatsAppResult
  try {
    const response = await fetch(
      `${GRAPH_BASE}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizedPhone,
          type: 'template',
          template: templatePayload,
        }),
      }
    )

    const data: MetaGraphResponse = await response.json()

    if (!response.ok || data.error) {
      const errMsg = data.error?.message ?? `HTTP ${response.status}`
      await db.prepare(
        `UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`
      ).bind(errMsg, now, notificationId).run()
      result = { success: false, error: errMsg }
    } else {
      const messageId = data.messages?.[0]?.id
      await db.prepare(
        `UPDATE notifications SET status = 'sent', provider_message_id = ?, sent_at = ? WHERE id = ?`
      ).bind(messageId, now, notificationId).run()
      result = { success: true, messageId }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Network error'
    await db.prepare(
      `UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`
    ).bind(errMsg, now, notificationId).run()
    result = { success: false, error: errMsg }
  }

  return result
}

/**
 * Lookup an org's WhatsApp notification phone from site_config.
 * Returns null if not set — callers should skip sending rather than throw.
 */
export async function getOrgWhatsAppPhone(
  db: D1Database,
  organizationId: string,
  siteId: string
): Promise<string | null> {
  const row = await db.prepare(`
    SELECT value FROM site_config
    WHERE organization_id = ? AND site_id = ? AND key = 'whatsapp_phone'
    LIMIT 1
  `).bind(organizationId, siteId).first<{ value: string }>()
  return row?.value ?? null
}

/**
 * Send a WhatsApp OTP code directly via Meta API.
 * Used by Better Auth phoneNumber plugin — no DB logging needed here
 * since Better Auth's verification table tracks the code lifecycle.
 */
export async function sendWhatsAppOtp(
  env: WhatsAppEnv,
  toPhone: string,
  code: string
): Promise<void> {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp env vars not configured')
  }

  const normalized = normalizePhone(toPhone)
  const templatePayload = TEMPLATES.otp_code({ code })

  const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalized,
      type: 'template',
      template: templatePayload,
    }),
  })

  if (!response.ok) {
    const err: MetaGraphResponse = await response.json()
    throw new Error(err?.error?.message ?? `WhatsApp OTP send failed: HTTP ${response.status}`)
  }
}

export async function sendWhatsAppText(
  env: WhatsAppEnv,
  toPhone: string,
  body: string
): Promise<SendWhatsAppResult> {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'WhatsApp env vars not configured' }
  }

  try {
    const normalized = normalizePhone(toPhone)
    const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalized,
        type: 'text',
        text: { preview_url: true, body },
      }),
    })

    const data = await response.json().catch(() => ({})) as MetaGraphResponse
    if (!response.ok || data.error) {
      return { success: false, error: data.error?.message ?? `HTTP ${response.status}` }
    }

    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function fetchWhatsAppMedia(
  env: WhatsAppEnv,
  mediaId: string
): Promise<{ bytes: ArrayBuffer; mimeType: string; fileSize: number; sha256?: string }> {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN
  if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN not configured')

  const configuredMaxBytes = Number(env.MAX_WHATSAPP_MEDIA_BYTES)
  const maxBytes = Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0
    ? configuredMaxBytes
    : DEFAULT_MAX_WHATSAPP_MEDIA_BYTES

  const metaResponse = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const meta = await metaResponse.json().catch(() => ({})) as MetaMediaResponse
  if (!metaResponse.ok || meta.error || !meta.url || !meta.mime_type) {
    throw new Error(meta.error?.message ?? 'Failed to fetch WhatsApp media metadata')
  }
  if (typeof meta.file_size === 'number' && meta.file_size > maxBytes) {
    throw new Error(`WhatsApp media ${mediaId} exceeds max size (${meta.file_size} > ${maxBytes} bytes)`) 
  }

  const mediaResponse = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!mediaResponse.ok) {
    throw new Error(`Failed to download WhatsApp media: HTTP ${mediaResponse.status}`)
  }

  const declaredContentLength = Number(mediaResponse.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredContentLength) && declaredContentLength > maxBytes) {
    throw new Error(`WhatsApp media ${mediaId} content-length exceeds max size (${declaredContentLength} > ${maxBytes} bytes)`)
  }

  if (!mediaResponse.body) {
    throw new Error(`Failed to download WhatsApp media ${mediaId}: empty response body`)
  }

  const reader = mediaResponse.body.getReader()
  const chunks: Uint8Array[] = []
  let totalSize = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    totalSize += value.byteLength
    if (totalSize > maxBytes) {
      await reader.cancel(`WhatsApp media ${mediaId} exceeded max size while streaming`)
      throw new Error(`WhatsApp media ${mediaId} exceeds max size while streaming (${totalSize} > ${maxBytes} bytes)`)
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(totalSize)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return {
    bytes: merged.buffer,
    mimeType: meta.mime_type,
    fileSize: meta.file_size ?? totalSize,
    sha256: meta.sha256,
  }
}

/**
 * Store (or update) the org's WhatsApp notification phone in site_config.
 * Normalizes to E.164 before saving.
 */
export async function setOrgWhatsAppPhone(
  db: D1Database,
  organizationId: string,
  siteId: string,
  phone: string
): Promise<void> {
  const normalized = normalizePhone(phone)
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO site_config (organization_id, site_id, key, value, updated_at)
    VALUES (?, ?, 'whatsapp_phone', ?, ?)
    ON CONFLICT(organization_id, site_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(organizationId, siteId, normalized, now).run()
}
