import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createError, getHeader } from 'h3'
import { queryFirst, queryAll } from '~/server/db'

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

  const billing = await queryFirst(db, `
    SELECT ob.organization_id, ob.stripe_customer_id,
           ob.stripe_subscription_id, ob.status, ob.plan,
           ob.payment_status, ob.current_period_end, ob.cancel_at_period_end, ob.updated_at
    FROM organization_billing ob
    WHERE ob.organization_id = ? LIMIT 1
  `, [organizationId])

  const entitlements = await queryAll(db, `
    SELECT se.site_id, se.key, se.value, se.source
    FROM site_entitlements se
    JOIN sites s ON s.id = se.site_id
    WHERE s.organization_id = ?
    ORDER BY se.key ASC
  `, [organizationId])

  const sitePlans = await queryAll(db, `
    SELECT id AS site_id, plan, status
    FROM sites
    WHERE organization_id = ?
    ORDER BY id ASC
  `, [organizationId])

  const invoicePayments = await queryAll(db, `
    SELECT stripe_invoice_id, organization_id, stripe_subscription_id,
           base_plan_price_id, status, period_start, period_end,
           last_event_id
    FROM stripe_invoice_payments
    WHERE organization_id = ?
    ORDER BY period_end DESC, stripe_invoice_id DESC
    LIMIT 20
  `, [organizationId])

  let sql = `
    SELECT id, stripe_event_id, event_type, status,
           claimed_at, lease_expires_at, attempt_count, created_at
    FROM stripe_webhook_events
    WHERE 1 = 1
  `
  const binds: string[] = []
  if (stripeEventId) {
    sql += ' AND stripe_event_id = ?'
    binds.push(stripeEventId)
  }
  sql += ' ORDER BY created_at DESC LIMIT 20'

  const webhookEvents = await queryAll(db, sql, binds)

  return jsonResponse({
    billing: billing ?? null,
    entitlements: entitlements ?? [],
    site_plans: sitePlans ?? [],
    invoice_payments: invoicePayments ?? [],
    webhook_events: webhookEvents ?? [],
  })
})
