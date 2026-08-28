import type { H3Event } from 'nitro'
import type { DbClient } from '~/server/db'
import { execute, queryFirst } from '~/server/db'
import { getClientIp } from '~/server/utils/hourly-rate-limit'
import { getOrCreateSessionId, getOrCreateVisitorId, hashIp } from '~/server/utils/pageview-tracking'
import type { SiteConversionEventName } from '~/utils/site-conversion-events'

export type ConversionStage = 'schedule_navigation' | 'external_booking_handoff' | 'submitted' | 'external_handoff'
export type ConversionEntityType = 'contact_submission' | 'reservation_submission' | 'experience_booking' | 'product' | 'site_link_item' | 'tenant_page'

const TAXONOMY: Record<SiteConversionEventName, { stages: ConversionStage[]; entityType: ConversionEntityType | null }> = {
  consultation_cta_click: { stages: ['schedule_navigation', 'external_booking_handoff'], entityType: null },
  contact_submit: { stages: ['submitted'], entityType: 'contact_submission' },
  reservation_submit: { stages: ['submitted'], entityType: 'reservation_submission' },
  experience_booking_submit: { stages: ['submitted'], entityType: 'experience_booking' },
  product_order_external_click: { stages: ['external_handoff'], entityType: 'product' },
  link_click: { stages: ['external_handoff'], entityType: 'site_link_item' },
  donation_click: { stages: ['external_handoff'], entityType: 'tenant_page' },
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
    const validScheduleEntity = input.entityType === undefined || input.entityType === null || input.entityType === 'tenant_page'
    if (input.stage === 'schedule_navigation' && !validScheduleEntity) throw new Error('Invalid entity type for consultation_cta_click')
    if (input.stage === 'external_booking_handoff' && (input.entityType || input.entityId)) throw new Error('External consultation handoffs cannot include an entity')
  }

  const now = new Date().toISOString()
  const sessionId = getOrCreateSessionId(event)
  const visitorId = getOrCreateVisitorId(event)
  await execute(db, `INSERT INTO site_analytics_sessions (
    id, organization_id, site_id, session_id, visitor_id, started_at, last_seen_at, landing_path,
    last_touch_source, last_touch_medium, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Direct', '(none)', ?, ?)
  ON CONFLICT(site_id, session_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at`, [
    crypto.randomUUID(), input.organizationId, input.siteId, sessionId, visitorId, now, now,
    input.pagePath?.startsWith('/') ? input.pagePath : '/', now, now,
  ])
  const session = await queryFirst<Record<string, unknown>>(db, `SELECT * FROM site_analytics_sessions WHERE site_id = ? AND session_id = ? LIMIT 1`, [input.siteId, sessionId])
  if (!session) throw new Error('Analytics session unavailable')

  const id = crypto.randomUUID()
  const ipHash = await hashIp(getClientIp(event))
  await execute(db, `INSERT OR IGNORE INTO site_conversion_events (
    id, organization_id, site_id, event_name, stage, session_id, visitor_id, location_id,
    entity_type, entity_id, page_type, page_path, cta_destination,
    source, medium, campaign, term, content, referrer_host,
    gclid, gbraid, wbraid, fbclid, msclkid, attributed_at, metadata_json, ip_hash, user_agent, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id, input.organizationId, input.siteId, input.eventName, input.stage,
    sessionId, visitorId, input.locationId ?? null, input.entityType ?? null, input.entityId ?? null,
    input.pageType ?? null, input.pagePath ?? null, input.ctaDestination ?? null,
    String(session.last_touch_source || 'Direct'), String(session.last_touch_medium || '(none)'),
    session.last_touch_campaign ?? null, session.last_touch_term ?? null, session.last_touch_content ?? null,
    session.last_touch_referrer_host ?? null, session.last_touch_gclid ?? null, session.last_touch_gbraid ?? null,
    session.last_touch_wbraid ?? null, session.last_touch_fbclid ?? null, session.last_touch_msclkid ?? null,
    now, input.metadata ? JSON.stringify(input.metadata) : null, ipHash,
    (event.req.headers.get('user-agent') || '').slice(0, 1024) || null, now,
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
