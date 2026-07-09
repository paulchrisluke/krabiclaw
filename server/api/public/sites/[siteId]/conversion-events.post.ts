import { queryFirst } from '~/server/db'
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { HOUR_MS, getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { recordSiteConversionEvent } from '~/server/utils/professional-services'

const VALID_EVENTS = new Set(['page_view', 'book_consultation_click', 'contact_submit'])
const CONVERSION_IP_HOURLY_LIMIT = 120

function boundedMetadata(value: unknown): ApiRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const serialized = JSON.stringify(value)
  return serialized.length <= 4000 ? value as ApiRecord : null
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })

  let body: ApiRecord
  try {
    body = await readBody(event)
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const eventName = cleanString(body.event_name, 80)
  if (!VALID_EVENTS.has(eventName)) return jsonResponse({ error: 'Invalid event_name' }, { status: 400 })

  const site = await queryFirst<{ id: string; organization_id: string; vertical: string | null; theme_id: string | null }>(db, `
    SELECT id, organization_id, vertical, theme_id
      FROM sites
     WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
     LIMIT 1
  `, [siteId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })
  if (site.vertical !== 'professional_service' && site.theme_id !== 'blawby-theme-v1') {
    return jsonResponse({ error: 'Tracking is not enabled for this site' }, { status: 404 })
  }

  const clientIp = getClientIp(event)
  const ipHash = clientIp ? await hashClientIp(clientIp) : null
  const hourWindow = new Date().toISOString().slice(0, 13)
  const rateLimitOk = await incrementHourlyRateLimit(
    db,
    `rate:conversion:${siteId}:ip:${ipHash ?? 'unknown'}:${hourWindow}`,
    import.meta.dev ? 1000 : CONVERSION_IP_HOURLY_LIMIT,
    HOUR_MS,
  )
  if (!rateLimitOk) return jsonResponse({ error: 'Too many events. Please try again later.' }, { status: 429 })

  const result = await recordSiteConversionEvent(db, {
    organizationId: site.organization_id,
    siteId,
    eventName: eventName as 'page_view' | 'book_consultation_click' | 'contact_submit',
    pageType: cleanString(body.page_type, 80) || null,
    pagePath: cleanString(body.page_path, 300) || null,
    pageLocation: cleanString(body.page_location, 500) || null,
    ctaDestination: cleanString(body.cta_destination, 500) || null,
    tenant: cleanString(body.tenant, 200) || null,
    metadata: boundedMetadata(body.metadata),
    ipHash,
    userAgent: cleanString(getHeader(event, 'user-agent'), 500) || null,
  })

  return jsonResponse({ success: true, id: result.id }, { status: 201 })
})
