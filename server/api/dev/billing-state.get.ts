import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { timingSafeEqualText } from '~/server/utils/dev-route-auth'
import { HTTPError, defineHandler  } from 'nitro';
import {  getQuery  } from 'nitro/h3';
import { queryFirst, queryAll } from '~/server/db'
import { validateOrganizationBillingProjection } from '~/server/utils/organization-billing'
import type { OrganizationBillingProjectionRow } from '~/server/utils/organization-billing'



export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const devMode = import.meta.dev
  const e2eOverride = env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!devMode && !e2eOverride) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (!devMode && e2eOverride) {
    const expectedSecret = env.E2E_DEV_ROUTE_SECRET || ''
    const providedSecret = (event.req.headers.get('x-dev-route-secret')) || ''
    if (!expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw new HTTPError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const organizationId = String(query.organization_id || '').trim()
  const stripeEventId = String(query.stripe_event_id || '').trim()
  if (!organizationId) {
    return jsonResponse({ error: 'organization_id is required' }, { status: 400 })
  }

  const billing = await queryFirst<OrganizationBillingProjectionRow>(db, `
    SELECT ob.organization_id, ob.stripe_customer_id, ob.stripe_subscription_id,
           ob.payment_status, ob.paid_through, ob.past_due_since,
           ob.access_plan, ob.access_expires_at, ob.updated_at
    FROM organization_billing ob
    WHERE ob.organization_id = ? LIMIT 1
  `, [organizationId])

  const sitePlans = await queryAll(db, `
    SELECT id AS site_id, status
    FROM sites
    WHERE organization_id = ?
    ORDER BY id ASC
  `, [organizationId])

  const invoicePayments = await queryAll(db, `
    SELECT stripe_invoice_id, organization_id, stripe_subscription_id, base_plan_price_id, status, period_start, period_end, last_event_id
    FROM stripe_invoice_payments
    WHERE organization_id = ?
    ORDER BY period_end DESC, stripe_invoice_id DESC
    LIMIT 20
  `, [organizationId])

  let sql = `
    SELECT id, stripe_event_id, event_type, status, claimed_at, lease_expires_at, attempt_count, created_at
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
    entitlements: validateOrganizationBillingProjection(billing, organizationId).entitlements,
    site_plans: sitePlans ?? [], invoice_payments: invoicePayments ?? [], webhook_events: webhookEvents ?? [], })
})
