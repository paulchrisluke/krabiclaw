import { parseCookies } from 'better-auth/cookies'
import type { DbClient } from '~/server/db'
import { execute, queryFirst } from '~/server/db'
import { getClientIp } from '~/server/utils/hourly-rate-limit'
import { ZARAZ_ANALYTICS_PURPOSE_ID, ZARAZ_CONSENT_COOKIE_NAME } from '~/utils/zaraz-consent'
import type { Ga4Projection } from '~/utils/ga4-projection'

/**
 * Google Analytics delivery for outcomes the server produces. Exactly one
 * sender owns each outcome: the browser (Zaraz web API) owns what the visitor
 * does on the page, the Zaraz HTTP Events API owns server-side outcomes that
 * still have a visitor's consent context (signup, onboarding), and Measurement
 * Protocol owns the Stripe subscription family. The destination is always the
 * measuring organization's own connected property, resolved from its canonical
 * host; there is no environment-level property and no synthetic client.
 *
 * The outcome of every attempt is written onto the native event
 * (`payload.ga4_delivery`), so reporting can tell a disabled, disconnected or
 * consent-rejected outcome from a provider failure without inventing zeros.
 */
export type Ga4DeliveryStatus = 'sent' | 'not_configured' | 'disconnected' | 'no_consent_context' | 'consent_rejected' | 'failed'
export type Ga4Transport = 'zaraz_http' | 'measurement_protocol'

export interface Ga4Delivery {
  transport: Ga4Transport
  status: Ga4DeliveryStatus
  detail?: string
}

interface Ga4Destination { measurementId: string; host: string }

type DestinationResult = { destination: Ga4Destination } | { status: 'not_configured' | 'disconnected'; detail: string }

async function resolveGa4Destination(db: DbClient, organizationId: string): Promise<DestinationResult> {
  const row = await queryFirst<{ status: string | null; measurement_id: string | null; host: string | null }>(db, `
    SELECT json_extract(o.integrations_json, '$.google_analytics.status') AS status,
           json_extract(o.integrations_json, '$.google_analytics.measurement_id') AS measurement_id,
           (SELECT d.domain FROM organization_domains d WHERE d.organization_id = o.id AND d.role = 'canonical' AND d.status = 'active') AS host
      FROM organization o WHERE o.id = ? LIMIT 1`, [organizationId])
  if (!row) throw new Error(`Organization ${organizationId} not found`)
  if (!row.status) return { status: 'not_configured', detail: 'no_google_analytics_integration' }
  if (row.status !== 'active') return { status: 'disconnected', detail: `integration_${row.status}` }
  if (!row.measurement_id) return { status: 'not_configured', detail: 'no_measurement_id' }
  if (!row.host) return { status: 'not_configured', detail: 'no_canonical_host' }
  return { destination: { measurementId: row.measurement_id, host: row.host } }
}

export async function readGa4Delivery(db: DbClient, eventId: string): Promise<Ga4Delivery | null> {
  const row = await queryFirst<{ delivery: string | null }>(db, `SELECT json_extract(payload_json, '$.ga4_delivery') AS delivery FROM analytics_events WHERE id = ?`, [eventId])
  return row?.delivery ? JSON.parse(row.delivery) as Ga4Delivery : null
}

async function recordGa4Delivery(db: DbClient, eventId: string, delivery: Ga4Delivery): Promise<Ga4Delivery> {
  await execute(db, `UPDATE analytics_events SET payload_json = json_set(payload_json, '$.ga4_delivery', json(?)) WHERE id = ?`, [JSON.stringify(delivery), eventId])
  if (delivery.status === 'failed') console.error('ga4_delivery_failed', { eventId, ...delivery })
  return delivery
}

export interface ZarazHttpEnv { ZARAZ_ANALYTICS?: string; ZARAZ_EVENTS_API_PATH?: string }

// Only the cookies Zaraz needs to honor the visitor's own answer and identity.
// The request's other cookies (sessions, credentials) are never forwarded.
function allowlistedCookies(origin: { headers: Headers }, measurementId: string): { consent: 'accepted' | 'rejected' | 'absent'; cookies: Record<string, string> } {
  const all = parseCookies(origin.headers.get('cookie') ?? '')
  const rawConsent = all.get(ZARAZ_CONSENT_COOKIE_NAME)
  if (!rawConsent) return { consent: 'absent', cookies: {} }
  let purposes: unknown
  try { purposes = JSON.parse(decodeURIComponent(rawConsent)) } catch { return { consent: 'absent', cookies: {} } }
  const accepted = typeof purposes === 'object' && purposes !== null && (purposes as Record<string, unknown>)[ZARAZ_ANALYTICS_PURPOSE_ID] === true
  if (!accepted) return { consent: 'rejected', cookies: {} }
  const cookies: Record<string, string> = { [ZARAZ_CONSENT_COOKIE_NAME]: rawConsent }
  for (const name of ['_ga', `_ga_${measurementId.replace(/^G-/, '')}`]) {
    const value = all.get(name)
    if (value) cookies[name] = value
  }
  return { consent: 'accepted', cookies }
}

/**
 * Sends a non-ecommerce outcome through Zaraz's HTTP Events API on the
 * measuring organization's host. Without the visitor's request there is no
 * consent to honor, so nothing is sent and the state says so.
 */
export async function deliverViaZarazHttp(env: ZarazHttpEnv, db: DbClient, input: {
  eventId: string; organizationId: string; projection: Ga4Projection; origin: { headers: Headers } | null
}): Promise<Ga4Delivery> {
  const transport = 'zaraz_http' as const
  const record = (status: Ga4DeliveryStatus, detail?: string) => recordGa4Delivery(db, input.eventId, { transport, status, ...(detail ? { detail } : {}) })
  if (input.projection.ecommerce) throw new Error(`${input.projection.name} is an ecommerce event; the Zaraz HTTP Events API path does not send ecommerce`)
  const resolved = await resolveGa4Destination(db, input.organizationId)
  if ('status' in resolved) return await record(resolved.status, resolved.detail)
  if (env.ZARAZ_ANALYTICS === 'absent') return await record('not_configured', 'zaraz_absent')
  if (!env.ZARAZ_EVENTS_API_PATH) return await record('not_configured', 'no_events_api_path')
  if (!input.origin) return await record('no_consent_context')
  const observed = allowlistedCookies(input.origin, resolved.destination.measurementId)
  if (observed.consent === 'absent') return await record('no_consent_context')
  if (observed.consent === 'rejected') return await record('consent_rejected')

  try {
    const response = await fetch(`https://${resolved.destination.host}${env.ZARAZ_EVENTS_API_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ events: [{
        client: { __zarazTrack: input.projection.name, ...input.projection.params },
        system: {
          cookies: observed.cookies,
          device: { ip: getClientIp({ req: input.origin }), 'user-agent': input.origin.headers.get('user-agent') ?? '', language: input.origin.headers.get('accept-language')?.split(',')[0] ?? '' },
          page: { url: `https://${resolved.destination.host}/`, title: '', referrer: '' },
        },
      }] }),
    })
    if (!response.ok) return await record('failed', `zaraz_http_${response.status}`)
    return await record('sent')
  } catch (error) {
    return await record('failed', error instanceof Error ? error.message : String(error))
  }
}

export interface MeasurementProtocolEnv { GA4_API_SECRET?: string }

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60

export interface MeasurementProtocolInput {
  organizationId: string
  event: { name: string; params: Record<string, unknown> }
  clientId: string | null
  userId: string | null
  sessionId: number | null
  sessionCapturedAt: number | null
}

/**
 * Posts one event to the measuring organization's property. The client ID is
 * the visitor's own GA client captured in their consenting browser; without
 * one there is no consent evidence and nothing is sent — a client is never
 * synthesized from a user ID.
 */
export async function sendMeasurementProtocol(env: MeasurementProtocolEnv, db: DbClient, input: MeasurementProtocolInput, nowSeconds = Math.floor(Date.now() / 1000)): Promise<Omit<Ga4Delivery, 'transport'>> {
  const resolved = await resolveGa4Destination(db, input.organizationId)
  if ('status' in resolved) return resolved
  if (!env.GA4_API_SECRET) return { status: 'not_configured', detail: 'no_api_secret' }
  if (!input.clientId) return { status: 'no_consent_context' }

  const params = { ...input.event.params }
  const fresh = input.sessionId !== null && input.sessionCapturedAt !== null
    && nowSeconds - input.sessionCapturedAt >= 0 && nowSeconds - input.sessionCapturedAt <= SESSION_MAX_AGE_SECONDS
  if (fresh) {
    params.session_id = input.sessionId
    params.engagement_time_msec = 1
  }
  try {
    const response = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(resolved.destination.measurementId)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ client_id: input.clientId, ...(input.userId ? { user_id: input.userId } : {}), events: [{ name: input.event.name, params }] }),
      },
    )
    return response.ok ? { status: 'sent' } : { status: 'failed', detail: `measurement_protocol_${response.status}` }
  } catch (error) {
    return { status: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Measurement Protocol delivery of a recorded native event, with the outcome
 * written onto it. An outcome already `sent` is not sent again, so a Stripe
 * redelivery after a failed attempt sends once. The caller decides whether a
 * `failed` outcome should make Stripe redeliver.
 */
export async function deliverViaMeasurementProtocol(env: MeasurementProtocolEnv, db: DbClient, input: MeasurementProtocolInput & { eventId: string }): Promise<Ga4Delivery> {
  const existing = await readGa4Delivery(db, input.eventId)
  if (existing?.status === 'sent') return existing
  return await recordGa4Delivery(db, input.eventId, { transport: 'measurement_protocol', ...await sendMeasurementProtocol(env, db, input) })
}
