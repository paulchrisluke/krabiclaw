export interface Ga4MeasurementEnv {
  GA4_MEASUREMENT_ID?: string
  GA4_API_SECRET?: string
}

export interface Ga4Item {
  item_id: string
  item_name?: string
  item_category?: string
  item_category2?: string
  price?: number
  quantity?: number
}

export interface Ga4Event {
  name: string
  params?: Record<string, unknown>
}

export interface Ga4MeasurementPayload {
  client_id: string
  user_id?: string
  events: Ga4Event[]
}

export interface SendGa4EventOptions {
  clientId?: string | null
  userId?: string | null
  sessionId?: string | number | null
  sessionCapturedAt?: number | null
  event: Ga4Event
}

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60

function normalizeNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function validSessionId(value: string | number | null | undefined): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function sessionIsFresh(sessionCapturedAt: number | null | undefined, nowSeconds: number): boolean {
  if (!Number.isSafeInteger(sessionCapturedAt) || !sessionCapturedAt) return false
  const age = nowSeconds - sessionCapturedAt
  return age >= 0 && age <= SESSION_MAX_AGE_SECONDS
}

async function deterministicServerClientId(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`krabiclaw-ga4-server-client:${userId}`),
  )
  const bytes = new Uint8Array(digest)
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `server.${hex.slice(0, 32)}`
}

export async function buildGa4MeasurementPayload(
  options: SendGa4EventOptions,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Ga4MeasurementPayload> {
  const userId = normalizeNonEmpty(options.userId)
  const clientId = normalizeNonEmpty(options.clientId)
    ?? (userId ? await deterministicServerClientId(userId) : null)
  if (!clientId) throw new Error(`GA4 ${options.event.name} event has no client_id or user_id fallback`)

  const params = { ...(options.event.params ?? {}) }
  const sessionId = validSessionId(options.sessionId)
  if (sessionId && sessionIsFresh(options.sessionCapturedAt, nowSeconds)) {
    params.session_id = sessionId
    if (params.engagement_time_msec === undefined) params.engagement_time_msec = 1
  } else {
    delete params.session_id
  }

  const payload: Ga4MeasurementPayload = {
    client_id: clientId,
    events: [{ name: options.event.name, params }],
  }
  if (userId) payload.user_id = userId
  return payload
}

export function validateGa4MeasurementPayload(payload: Ga4MeasurementPayload): void {
  if (!normalizeNonEmpty(payload.client_id)) throw new Error('GA4 payload requires client_id')
  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new Error('GA4 payload requires at least one event')
  }

  for (const event of payload.events) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(event.name)) {
      throw new Error(`Invalid GA4 event name: ${event.name}`)
    }
    if (!event.params || typeof event.params !== 'object' || Array.isArray(event.params)) {
      throw new Error(`GA4 event ${event.name} requires params`)
    }
    if (event.name !== 'purchase') continue
    const transactionId = event.params.transaction_id
    const value = event.params.value
    const currency = event.params.currency
    const items = event.params.items
    if (typeof transactionId !== 'string' || transactionId.length === 0) {
      throw new Error('GA4 purchase requires transaction_id')
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error('GA4 purchase requires a finite non-negative value')
    }
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      throw new Error('GA4 purchase requires a three-letter uppercase currency')
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('GA4 purchase requires at least one item')
    }
  }
}

export async function sendGa4Event(
  env: Ga4MeasurementEnv,
  options: SendGa4EventOptions,
): Promise<void> {
  const measurementId = normalizeNonEmpty(env.GA4_MEASUREMENT_ID)
  const apiSecret = normalizeNonEmpty(env.GA4_API_SECRET)
  if (!measurementId || !apiSecret) return

  const payload = await buildGa4MeasurementPayload(options)
  validateGa4MeasurementPayload(payload)

  const response = await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  if (!response.ok) {
    throw new Error(`GA4 Measurement Protocol failed for ${options.event.name}: ${response.status}`)
  }
}
