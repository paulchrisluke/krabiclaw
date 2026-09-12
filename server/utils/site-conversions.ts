import type { H3Event } from 'nitro'
import type { DbClient } from '~/server/db'
import { execute, queryFirst } from '~/server/db'
import { getClientIp } from '~/server/utils/hourly-rate-limit'
import { getOrCreateSessionId, getOrCreateVisitorId, hashIp } from '~/server/utils/pageview-tracking'
import type { SiteConversionEventName } from '~/utils/site-conversion-events'

export type ConversionStage = 'schedule_navigation' | 'external_booking_handoff' | 'submitted' | 'external_handoff'
export type ConversionEntityType = 'request' | 'product' | 'content_block' | 'content_document'

const TAXONOMY: Record<SiteConversionEventName, { stages: ConversionStage[]; entityType: ConversionEntityType | null }> = {
  consultation_cta_click: { stages: ['schedule_navigation', 'external_booking_handoff'], entityType: null },
  contact_submit: { stages: ['submitted'], entityType: 'request' },
  reservation_submit: { stages: ['submitted'], entityType: 'request' },
  booking_submit: { stages: ['submitted'], entityType: 'request' },
  product_order_external_click: { stages: ['external_handoff'], entityType: 'product' },
  link_click: { stages: ['external_handoff'], entityType: 'content_block' },
  donation_click: { stages: ['external_handoff'], entityType: 'content_document' },
}

export interface SiteConversionInput {
  organizationId: string
  siteId: string
  eventName: SiteConversionEventName
  stage: ConversionStage
  locationId?: string | null
  entityType?: ConversionEntityType | null
  entityId?: string | null
  pageType?: string | null
  pagePath?: string | null
  ctaDestination?: string | null
  metadata?: ApiRecord | null
}

export async function recordSiteConversionEvent(db: DbClient, event: H3Event, input: SiteConversionInput) {
  const rule = TAXONOMY[input.eventName]
  if (!rule.stages.includes(input.stage)) throw new Error(`Invalid stage for ${input.eventName}`)
  if (rule.entityType !== null && input.entityType !== rule.entityType) throw new Error(`Invalid entity type for ${input.eventName}`)
  if ((input.entityType && !input.entityId) || (!input.entityType && input.entityId)) throw new Error('entityType and entityId must be supplied together')
  if (input.eventName === 'consultation_cta_click') {
    const validScheduleEntity = input.entityType === undefined || input.entityType === null || input.entityType === 'content_document'
    if (input.stage === 'schedule_navigation' && !validScheduleEntity) throw new Error('Invalid entity type for consultation_cta_click')
    if (input.stage === 'external_booking_handoff' && (input.entityType || input.entityId)) throw new Error('External consultation handoffs cannot include an entity')
  }

  const now = new Date().toISOString()
  const sessionId = getOrCreateSessionId(event)
  const visitorId = getOrCreateVisitorId(event)
  const session = await queryFirst<{ attribution: string }>(db, `INSERT INTO analytics_summaries (
    id, kind, organization_id, site_id, date, key, payload_json, created_at, updated_at
  ) VALUES (?, 'session', ?, ?, '', ?, ?, ?, ?)
  ON CONFLICT(site_id, kind, date, key) DO UPDATE SET
    payload_json = json_set(analytics_summaries.payload_json, '$.last_seen_at', excluded.updated_at), updated_at = excluded.updated_at
  RETURNING json_extract(payload_json, '$.attribution') attribution`, [
    crypto.randomUUID(), input.organizationId, input.siteId, sessionId,
    JSON.stringify({ visitor_id: visitorId, started_at: now, last_seen_at: now,
      landing_path: input.pagePath?.startsWith('/') ? input.pagePath : '/', duration_seconds: 0,
      attribution: { source: 'Direct', medium: '(none)', campaign: null, term: null, content: null,
        referrerHost: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null }, last_touch_at: null }), now, now,
  ])
  if (!session) throw new Error('Analytics session unavailable')

  const id = crypto.randomUUID()
  const ipHash = await hashIp(getClientIp(event))
  await execute(db, `INSERT OR IGNORE INTO analytics_events (
    id, kind, organization_id, site_id, session_id, visitor_id, location_id, page_path, payload_json, created_at
  ) VALUES (?, 'conversion', ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id, input.organizationId, input.siteId, sessionId, visitorId, input.locationId ?? null, input.pagePath ?? null,
    JSON.stringify({ event_name: input.eventName, stage: input.stage, entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null, page_type: input.pageType ?? null, cta_destination: input.ctaDestination ?? null,
      attribution: JSON.parse(session.attribution), attributed_at: now, metadata: input.metadata ?? null,
      ip_hash: ipHash, user_agent: (event.req.headers.get('user-agent') || '').slice(0, 1024) || null }), now,
  ])
  return { id }
}

export async function recordSubmissionConversionSafe(db: DbClient, event: H3Event, input: SiteConversionInput) {
  try {
    await recordSiteConversionEvent(db, event, input)
  } catch (error) {
    console.error('site_conversion_write_failed', {
      siteId: input.siteId,
      eventName: input.eventName,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
