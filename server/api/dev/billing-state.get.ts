import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createError, getHeader } from 'h3'

const textEncoder = new TextEncoder()

function timingSafeEqualText(a: string, b: string): boolean {
  const left = textEncoder.encode(a)
  const right = textEncoder.encode(b)
  if (left.length !== right.length) {
    let _noop = 0
    for (let i = 0; i < left.length; i += 1) _noop |= left[i]!
    return false
  }
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!
  return diff === 0
}

export default defineEventHandler(async (event) => {
  const devMode = import.meta.dev
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!devMode && !e2eOverride) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (!devMode && e2eOverride) {
    const expectedSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
    const providedSecret = getHeader(event, 'x-dev-route-secret') || ''
    if (!expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const organizationId = String(query.organization_id || '').trim()
  const stripeEventId = String(query.stripe_event_id || '').trim()

  if (!organizationId) {
    return jsonResponse({ error: 'organization_id is required' }, { status: 400 })
  }

  const billing = await db.prepare(`
    SELECT ob.organization_id, ob.stripe_customer_id,
           sb.site_id, sb.stripe_subscription_id, sb.stripe_subscription_item_id,
           sb.status, sb.plan, sb.current_period_end, sb.cancel_at_period_end, sb.updated_at
    FROM organization_billing ob
    LEFT JOIN sites s ON s.organization_id = ob.organization_id
    LEFT JOIN site_billing sb ON sb.site_id = s.id
    WHERE ob.organization_id = ?
    ORDER BY s.created_at ASC LIMIT 1
  `).bind(organizationId).first()

  const entitlements = await db.prepare(`
    SELECT se.key, se.value, se.source, se.created_at, se.updated_at
    FROM site_entitlements se
    JOIN sites s ON s.id = se.site_id
    WHERE s.organization_id = ?
    ORDER BY se.key ASC
  `).bind(organizationId).all()

  let sql = `
    SELECT id, stripe_event_id, event_type, status, payload, error, created_at
    FROM stripe_webhook_events
    WHERE 1 = 1
  `
  const binds: string[] = []
  if (stripeEventId) {
    sql += ' AND stripe_event_id = ?'
    binds.push(stripeEventId)
  }
  sql += ' ORDER BY created_at DESC LIMIT 20'

  const webhookEvents = await db.prepare(sql).bind(...binds).all()

  return jsonResponse({
    billing: billing ?? null,
    entitlements: entitlements.results ?? [],
    webhook_events: webhookEvents.results ?? [],
  })
})
