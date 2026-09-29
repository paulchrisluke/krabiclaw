import { parseCookies } from 'better-auth/cookies'
import type { DbClient } from '~/server/db'
import { execute, queryFirst } from '~/server/db'
import { getClientIp } from '~/server/utils/hourly-rate-limit'
import { deliverForVisitor, type MeasurementProtocolEnv } from '~/server/utils/ga4-delivery'
import { projectConversionToGa4 } from '~/utils/ga4-projection'
import { SESSION_COOKIE, VISITOR_COOKIE, hashIp, isCanonicalEventId } from '~/server/utils/pageview-tracking'
import {
  CONVERSION_EVENT_CATALOG,
  type ConversionEntityType,
  type ConversionStage,
  type ConversionValue,
  type OrganizationConversionEventName,
} from '~/utils/organization-conversion-events'

export type { ConversionEntityType, ConversionStage }

export type ConversionSurface = 'website' | 'dashboard' | 'mcp' | 'auth' | 'stripe'

export interface OrganizationConversionInput {
  /** The business whose outcome is measured — not necessarily the subject's own organization. */
  organizationId: string
  eventName: OrganizationConversionEventName
  stage: ConversionStage
  locationId?: string | null
  entityType?: ConversionEntityType | null
  entityId?: string | null
  pageType?: string | null
  pagePath?: string | null
  ctaDestination?: string | null
  metadata?: ApiRecord | null
  value?: ConversionValue | null
  surface: ConversionSurface
  /** The staff member or agent who performed the transition, when it is not the subject. */
  actor?: { type: 'staff' | 'agent'; id: string } | null
  /** Overrides the event time; defaults to now. Provider events carry their own occurrence time. */
  occurredAt?: string
}

/**
 * Records one conversion for `input.organizationId`.
 *
 * `origin` is the request (`event.req`) made by the person who produced the outcome, or null
 * when nobody was there (webhook, MCP, scheduled work). Only a request that
 * already carries this platform's own analytics cookies gives the event a
 * browser session and attribution snapshot; anything else is recorded as a
 * nonbrowser outcome with no attribution. A browser session is never minted
 * here.
 */
export async function recordOrganizationConversionEvent(db: DbClient, origin: { headers: Headers } | null, input: OrganizationConversionInput) {
  const rule = CONVERSION_EVENT_CATALOG[input.eventName]
  if (!(rule.stages as readonly ConversionStage[]).includes(input.stage)) throw new Error(`Invalid stage for ${input.eventName}`)
  if (rule.entityType !== null && input.entityType !== rule.entityType) throw new Error(`Invalid entity type for ${input.eventName}`)
  if ((input.entityType && !input.entityId) || (!input.entityType && input.entityId)) throw new Error('entityType and entityId must be supplied together')
  if (input.eventName === 'consultation_cta_click') {
    const validScheduleEntity = input.entityType === undefined || input.entityType === null || input.entityType === 'content_document'
    if (input.stage === 'schedule_navigation' && !validScheduleEntity) throw new Error('Invalid entity type for consultation_cta_click')
    if (input.stage === 'external_booking_handoff' && (input.entityType || input.entityId)) throw new Error('External consultation handoffs cannot include an entity')
  }
  if (input.value) {
    if (rule.valueBasis !== input.value.basis) throw new Error(`${input.eventName} cannot carry a ${input.value.basis} value`)
    if (!Number.isSafeInteger(input.value.amount_minor) || (input.value.basis === 'refund' ? input.value.amount_minor <= 0 : input.value.amount_minor < 0)) {
      throw new Error(`Invalid ${input.eventName} value amount`)
    }
    if (!/^[A-Z]{3}$/.test(input.value.currency)) throw new Error(`Invalid ${input.eventName} value currency`)
    if (input.value.basis !== 'quoted' && !input.value.transaction_id) throw new Error(`${input.eventName} requires a transaction identity`)
  }

  const now = input.occurredAt ?? new Date().toISOString()
  const cookies = parseCookies(origin?.headers.get('cookie') ?? '')
  const sessionId = cookies.get(SESSION_COOKIE)
  const visitorId = cookies.get(VISITOR_COOKIE)
  const browser = isCanonicalEventId(sessionId) && isCanonicalEventId(visitorId) ? { sessionId, visitorId } : null

  let attribution: unknown = null
  if (browser) {
    const session = await queryFirst<{ attribution: string }>(db, `INSERT INTO analytics_summaries (
      id, kind, organization_id, date, key, payload_json, created_at, updated_at
    ) VALUES (?, 'session', ?, '', ?, ?, ?, ?)
    ON CONFLICT(organization_id, kind, date, key) DO UPDATE SET
      payload_json = json_set(analytics_summaries.payload_json, '$.last_seen_at', excluded.updated_at), updated_at = excluded.updated_at
    RETURNING json_extract(payload_json, '$.attribution') attribution`, [
      crypto.randomUUID(), input.organizationId, browser.sessionId,
      JSON.stringify({ visitor_id: browser.visitorId, started_at: now, last_seen_at: now,
        landing_path: input.pagePath?.startsWith('/') ? input.pagePath : '/', duration_seconds: 0,
        attribution: { source: 'Direct', medium: '(none)', campaign: null, term: null, content: null,
          referrerHost: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null }, last_touch_at: null }), now, now,
    ])
    if (!session) throw new Error('Analytics session unavailable')
    attribution = JSON.parse(session.attribution)
  }

  const id = crypto.randomUUID()
  const ipHash = origin ? await hashIp(getClientIp({ req: origin })) : null
  const payload = JSON.stringify({ event_name: input.eventName, stage: input.stage, entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null, page_type: input.pageType ?? null, cta_destination: input.ctaDestination ?? null,
    conversion_type: rule.conversionType, surface: input.surface, actor: input.actor ?? null,
    attribution, attributed_at: browser ? now : null, value: input.value ?? null, metadata: input.metadata ?? null,
    ip_hash: ipHash, user_agent: (origin?.headers.get('user-agent') || '').slice(0, 1024) || null })
  const inserted = await execute(db, `INSERT OR IGNORE INTO analytics_events (
    id, kind, organization_id, session_id, visitor_id, location_id, page_path, payload_json, created_at
  ) VALUES (?, 'conversion', ?, ?, ?, ?, ?, ?, ?)`, [
    id, input.organizationId, browser?.sessionId ?? null, browser?.visitorId ?? null, input.locationId ?? null, input.pagePath ?? null, payload, now,
  ])
  if (Number(inserted.meta?.changes ?? 0) === 1) return { id, created: true }

  // The insert was ignored by the entity-uniqueness index: the outcome is
  // already recorded, and its persisted identity is the answer.
  const existing = await queryFirst<{ id: string }>(db, `SELECT id FROM analytics_events
    WHERE kind = 'conversion' AND organization_id = ? AND (payload_json ->> '$.event_name') = ?
      AND (payload_json ->> '$.entity_type') = ? AND (payload_json ->> '$.entity_id') = ?`,
  [input.organizationId, input.eventName, input.entityType ?? null, input.entityId ?? null])
  if (!existing) throw new Error(`Conversion ${input.eventName} was neither inserted nor found`)
  return { id: existing.id, created: false }
}

/**
 * Records a server-produced outcome and, the first time it is recorded, sends
 * its GA4 projection through Measurement Protocol, with the consent and GA client of the visitor's own request. A repeat of the same
 * outcome returns the persisted event and sends nothing: one outcome, one GA
 * event. The outcome of the send lives on the event (`ga4_delivery`).
 */
export async function recordAndDeliverConversion(env: MeasurementProtocolEnv, db: DbClient, origin: { headers: Headers } | null, input: OrganizationConversionInput) {
  const recorded = await recordOrganizationConversionEvent(db, origin, input)
  if (recorded.created) {
    await deliverForVisitor(env, db, {
      eventId: recorded.id, organizationId: input.organizationId, origin,
      projection: projectConversionToGa4({ eventName: input.eventName, value: input.value }),
    })
  }
  return recorded
}
