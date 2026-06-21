const GRAPH_API_VERSION = 'v25.0'

interface ProviderStatusEnv {
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_ACCESS_TOKEN?: string
  RESEND_API_KEY?: string
}

export interface ProviderStatusResult {
  ok: boolean
  detail: string
}

/** Read-only check: confirms the WhatsApp number + access token are live. Sends no message. */
export async function getWhatsAppProviderStatus(env: ProviderStatusEnv): Promise<ProviderStatusResult> {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) {
    return { ok: false, detail: 'WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not configured' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}?fields=display_phone_number,quality_rating,code_verification_status`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal }
    )
    clearTimeout(timeoutId)
    const body = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
    if (!response.ok || body.error) {
      return { ok: false, detail: body.error?.message ?? `HTTP ${response.status}` }
    }
    return { ok: true, detail: `connected (${body.id ?? phoneNumberId})` }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, detail: 'Request timed out after 10 seconds' }
    }
    return { ok: false, detail: error instanceof Error ? error.message : 'Network error' }
  }
}

/** Read-only check: confirms the Resend API key is live and at least one domain is verified. Sends no email. */
export async function getResendProviderStatus(env: ProviderStatusEnv): Promise<ProviderStatusResult> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, detail: 'RESEND_API_KEY not configured' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const body = await response.json().catch(() => ({})) as { data?: Array<{ status?: string }>; message?: string }
    if (!response.ok) {
      return { ok: false, detail: body.message ?? `HTTP ${response.status}` }
    }
    const verifiedCount = (body.data ?? []).filter((d) => d.status === 'verified').length
    if (verifiedCount === 0) {
      return { ok: false, detail: 'No verified Resend domains' }
    }
    return { ok: true, detail: `${verifiedCount} verified domain(s)` }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, detail: 'Request timed out after 10 seconds' }
    }
    return { ok: false, detail: error instanceof Error ? error.message : 'Network error' }
  }
}
