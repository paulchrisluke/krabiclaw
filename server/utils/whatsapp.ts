// Meta Cloud API — WhatsApp Business send-only notifications.
// All messages use pre-approved templates (WhatsApp requires this for business-initiated messages).
// Phone numbers stored and sent in E.164 format (+14233585761).

const GRAPH_API_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export type WhatsAppTemplate =
  | 'draft_published'
  | 'new_review'
  | 'ai_action_complete'
  | 'low_credits'

interface TemplateComponent {
  type: 'body'
  parameters: Array<{ type: 'text'; text: string }>
}

// Map our template names to Meta template names + variable builders.
// Meta template names must match exactly what was approved in Business Manager.
const TEMPLATES: Record<
  WhatsAppTemplate,
  (vars: Record<string, string>) => { name: string; language: string; components: TemplateComponent[] }
> = {
  draft_published: (v) => ({
    name: 'draft_published',
    language: 'en_US',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.site_name ?? 'your site' },
        { type: 'text', text: v.url ?? '' },
      ],
    }],
  }),
  new_review: (v) => ({
    name: 'new_review',
    language: 'en_US',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.rating ?? '5' },
        { type: 'text', text: v.site_name ?? 'your site' },
        { type: 'text', text: (v.excerpt ?? '').slice(0, 100) },
      ],
    }],
  }),
  ai_action_complete: (v) => ({
    name: 'ai_action_complete',
    language: 'en_US',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.action_summary ?? 'AI task' },
        { type: 'text', text: v.preview_url ?? '' },
      ],
    }],
  }),
  low_credits: (v) => ({
    name: 'low_credits',
    language: 'en_US',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.credits_remaining ?? '0' },
        { type: 'text', text: v.upgrade_url ?? 'https://krabiclaw.com/dashboard/billing' },
      ],
    }],
  }),
}

/** Normalize any phone number to E.164. Assumes US if no country code. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`   // US default
  if (digits.length > 10) return `+${digits}`
  return `+${digits}`
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
  env: Record<string, any>,
  db: any,
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
  const vars = opts.vars ?? {}

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

    const data = await response.json() as any

    if (!response.ok || data.error) {
      const errMsg = data.error?.message ?? `HTTP ${response.status}`
      await db.prepare(
        `UPDATE notifications SET status = 'failed', error = ?, sent_at = ? WHERE id = ?`
      ).bind(errMsg, now, notificationId).run()
      result = { success: false, error: errMsg }
    } else {
      const messageId = data.messages?.[0]?.id ?? null
      await db.prepare(
        `UPDATE notifications SET status = 'sent', provider_message_id = ?, sent_at = ? WHERE id = ?`
      ).bind(messageId, now, notificationId).run()
      result = { success: true, messageId }
    }
  } catch (err: any) {
    const errMsg = err?.message ?? 'Network error'
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
  db: any,
  organizationId: string,
  siteId: string
): Promise<string | null> {
  const row = await db.prepare(`
    SELECT value FROM site_config
    WHERE organization_id = ? AND site_id = ? AND key = 'whatsapp_phone'
    LIMIT 1
  `).bind(organizationId, siteId).first()
  return row?.value ?? null
}

/**
 * Store (or update) the org's WhatsApp notification phone in site_config.
 * Normalizes to E.164 before saving.
 */
export async function setOrgWhatsAppPhone(
  db: any,
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
