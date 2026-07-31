import { queryFirst } from '~/server/db'
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { HOUR_MS, getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { recordSiteConversionEvent } from '~/server/utils/professional-services'
import { SITE_CONVERSION_EVENT_NAMES, type SiteConversionEventName } from '~/utils/site-conversion-events'

const VALID_EVENTS = new Set<string>(SITE_CONVERSION_EVENT_NAMES)
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
  if (eventName !== 'link_click' && (site.vertical !== 'service' || site.theme_id !== 'blawby-theme-v1')) {
    return jsonResponse({ error: 'Tracking is not enabled for this site' }, { status: 404 })
  }

  let ctaDestination = cleanString(body.cta_destination, 500) || null
  let metadata = boundedMetadata(body.metadata)

  if (eventName === 'link_click') {
    const rawMetadata = body.metadata
    const linkItemId = rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
      ? cleanString((rawMetadata as ApiRecord).link_item_id, 120)
      : ''
    if (!linkItemId) return jsonResponse({ error: 'metadata.link_item_id is required' }, { status: 400 })

    const link = await queryFirst<{ id: string; label: string; destination: string; sort_order: number; page_path: string }>(db, `
      SELECT li.id, li.label, li.destination, li.sort_order, lp.path AS page_path
        FROM site_link_items li
        JOIN site_link_pages lp ON lp.id = li.link_page_id
       WHERE li.id = ?
         AND li.site_id = ?
         AND li.status = 'active'
         AND lp.status = 'published'
         AND lp.path = '/links'
       LIMIT 1
    `, [linkItemId, siteId])
    if (!link) return jsonResponse({ error: 'Link item not found' }, { status: 404 })

    ctaDestination = link.destination
    metadata = {
      link_item_id: link.id,
      link_label: link.label,
      position: Number(link.sort_order ?? 0) + 1,
    }
    body.page_type = 'links'
    body.page_path = link.page_path
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
    eventName: eventName as SiteConversionEventName,
    pageType: cleanString(body.page_type, 80) || null,
    pagePath: cleanString(body.page_path, 300) || null,
    pageLocation: cleanString(body.page_location, 500) || null,
    ctaDestination,
    tenant: cleanString(body.tenant, 200) || null,
    metadata,
    ipHash,
    userAgent: cleanString(getHeader(event, 'user-agent'), 500) || null,
  })

  return jsonResponse({ success: true, id: result.id }, { status: 201 })
})
