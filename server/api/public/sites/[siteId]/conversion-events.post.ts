import { getRouterParam, readBody } from 'nitro/h3'
import { queryAll, queryFirst } from '~/server/db'
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { HOUR_MS, getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { recordSiteConversionEvent, type ConversionEntityType, type ConversionStage } from '~/server/utils/site-conversions'
import { SITE_CONVERSION_EVENT_NAMES, type SiteConversionEventName } from '~/utils/site-conversion-events'
import { normalizeVertical } from '~/utils/vertical-copy'
import { defineHandler } from 'nitro'
import { TENANT_TYPES } from '~/utils/tenant-routing'

const VALID_EVENTS = new Set<string>(SITE_CONVERSION_EVENT_NAMES)

function destinationHost(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.hostname.toLowerCase() : null
  } catch {
    return null
  }
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })
  if (event.context.tenantType !== TENANT_TYPES.TENANT || event.context.siteId !== siteId) {
    return jsonResponse({ error: 'Site not found' }, { status: 404 })
  }
  const db = cloudflareEnv(event).db
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
  let body: ApiRecord
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid request body' }, { status: 400 }) }

  const eventName = cleanString(body.event_name, 80)
  if (!VALID_EVENTS.has(eventName)) return jsonResponse({ error: 'Invalid event_name' }, { status: 400 })
  const site = await queryFirst<{ id: string; organization_id: string; vertical: string | null }>(db,
    `SELECT id, organization_id, vertical FROM sites WHERE id = ? AND status = 'active' AND onboarding_status = 'active' LIMIT 1`, [siteId])
  if (!site || !normalizeVertical(site.vertical)) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const ipHash = await hashClientIp(getClientIp(event))
  const hour = new Date().toISOString().slice(0, 13)
  if (!await incrementHourlyRateLimit(db, `rate:conversion:${siteId}:ip:${ipHash}:${hour}`, import.meta.dev ? 1000 : 120, HOUR_MS)) {
    return jsonResponse({ error: 'Too many events. Please try again later.' }, { status: 429 })
  }

  let stage: ConversionStage
  let entityType: ConversionEntityType | null = null
  let entityId: string | null = null
  let locationId: string | null = null
  let pageType: string | null = null
  let pagePath: string | null = null
  let ctaDestination: string | null = null
  let metadata: ApiRecord | null = null

  if (eventName === 'consultation_cta_click') {
    if (body.stage !== 'schedule_navigation') return jsonResponse({ error: 'Invalid consultation stage' }, { status: 400 })
    stage = 'schedule_navigation'
    pageType = cleanString(body.page_type, 80) || null
    pagePath = cleanString(body.page_path, 300) || null
    if (pagePath && (!pagePath.startsWith('/') || pagePath.includes('?') || pagePath.includes('#'))) return jsonResponse({ error: 'Invalid page_path' }, { status: 400 })
    const pageId = cleanString(body.page_id, 120)
    if (pageId) {
      const page = await queryFirst<{ id: string }>(db, 'SELECT id FROM tenant_pages WHERE id = ? AND site_id = ? LIMIT 1', [pageId, siteId])
      if (!page) return jsonResponse({ error: 'Page not found' }, { status: 404 })
      entityType = 'tenant_page'; entityId = page.id
    }
    ctaDestination = '/schedule'
  } else if (eventName === 'product_order_external_click') {
    stage = 'external_handoff'
    locationId = cleanString(body.location_id, 120) || null
    entityId = cleanString(body.product_id, 120) || null
    if (!locationId || !entityId) return jsonResponse({ error: 'location_id and product_id are required' }, { status: 400 })
    const product = await queryFirst<{ id: string; order_url: string }>(db, `SELECT id, order_url FROM products WHERE id = ? AND site_id = ? AND location_id = ? AND is_visible = 1 AND available = 1 AND order_url IS NOT NULL LIMIT 1`, [entityId, siteId, locationId])
    if (!product || !destinationHost(product.order_url)) return jsonResponse({ error: 'Product not found' }, { status: 404 })
    const destinationHostname = new URL(product.order_url).hostname.toLowerCase()
    entityType = 'product'; ctaDestination = destinationHostname; pageType = 'product'; metadata = { product_id: product.id, destination_hostname: destinationHostname }
  } else if (eventName === 'link_click') {
    stage = 'external_handoff'
    entityId = cleanString(body.link_item_id, 120) || null
    if (!entityId) return jsonResponse({ error: 'link_item_id is required' }, { status: 400 })
    const link = await queryFirst<{ id: string; label: string; destination: string; sort_order: number; page_path: string }>(db, `SELECT li.id, li.label, li.destination, li.sort_order, lp.path page_path FROM site_link_items li JOIN site_link_pages lp ON lp.id = li.link_page_id WHERE li.id = ? AND li.site_id = ? AND li.status = 'active' LIMIT 1`, [entityId, siteId])
    const host = link ? destinationHost(link.destination) : null
    if (!link || !host) return jsonResponse({ error: 'Link item not found' }, { status: 404 })
    entityType = 'site_link_item'; ctaDestination = host; pageType = 'links'; pagePath = link.page_path
    metadata = { link_label: link.label, position: Number(link.sort_order) + 1, destination_hostname: host }
  } else if (eventName === 'donation_click') {
    stage = 'external_handoff'
    const variantId = cleanString(body.tenant_page_variant_id, 120)
    const tierLabel = cleanString(body.tier_label, 100)
    const tierAmount = body.tier_amount == null ? null : Number(body.tier_amount)
    if (!variantId || !tierLabel || (tierAmount !== null && (!Number.isFinite(tierAmount) || tierAmount <= 0))) return jsonResponse({ error: 'Valid tenant_page_variant_id and donation choice are required' }, { status: 400 })
    const page = await queryFirst<{ id: string; page_id: string; path: string }>(db, `
      SELECT v.id, v.page_id, v.path
        FROM tenant_pages p
        JOIN tenant_page_variants v ON v.page_id = p.id
       WHERE v.id = ? AND v.site_id = ? AND p.recipe = 'donate'
       LIMIT 1
    `, [variantId, siteId])
    if (!page) return jsonResponse({ error: 'Donation page not found' }, { status: 404 })
    const blocks = await queryAll<{ data_json: string }>(db, `SELECT cb.data_json FROM content_documents cd JOIN content_blocks cb ON cb.document_id = cd.id WHERE cd.owner_type = 'tenant_page' AND cd.owner_id = ? AND cb.type = 'donation_choices'`, [variantId])
    const choices = blocks.flatMap((row) => {
      try {
        const data = JSON.parse(row.data_json) as ApiRecord
        const host = typeof data.destination === 'string' ? destinationHost(data.destination) : null
        const tiers = Array.isArray(data.tiers) ? data.tiers : []
        return host ? [{ host, tiers }] : []
      } catch {
        return []
      }
    })
    const choice = choices.find(({ tiers }) => tierLabel === 'Custom Amount'
      ? tierAmount === null
      : tiers.some((candidate: unknown) => {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
          const tier = candidate as ApiRecord
          return tier.title === tierLabel && Number(tier.amount) === tierAmount
        }))
    if (!choice) return jsonResponse({ error: 'Donation choice is not published' }, { status: 400 })
    entityType = 'tenant_page'; entityId = page.page_id; pageType = 'donate'; pagePath = page.path; ctaDestination = choice.host
    metadata = { tier_label: tierLabel, ...(tierAmount === null ? {} : { tier_amount: tierAmount }), destination_hostname: choice.host }
  } else {
    return jsonResponse({ error: 'Submission conversions are server-produced' }, { status: 400 })
  }

  const result = await recordSiteConversionEvent(db, event, {
    organizationId: site.organization_id, siteId, eventName: eventName as SiteConversionEventName,
    stage, locationId, entityType, entityId, pageType, pagePath, ctaDestination, metadata,
  })
  return jsonResponse({ success: true, id: result.id }, { status: 201 })
})
