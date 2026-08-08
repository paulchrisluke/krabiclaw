import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createError, getHeader, toWebRequest } from 'h3'
import { queryFirst, queryAll } from '~/server/db'
import { createAuth } from '~/server/utils/auth'

function stableTimestamp(value: Date | number | string | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value
    const date = new Date(millis)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (typeof value === 'string' && value.trim()) return value
  return null
}

interface BetterAuthSubscriptionRead {
  id?: string
  referenceId?: string
  plan?: string
  status?: string
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  periodStart?: Date | number | string | null
  periodEnd?: Date | number | string | null
  cancelAtPeriodEnd?: boolean | number | null
}

interface BetterAuthSubscriptionApi {
  listActiveSubscriptions(_input: {
    query: { referenceId: string; customerType: 'organization' }
    headers: Headers
  }): Promise<BetterAuthSubscriptionRead[]>
}

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

  // Better Auth owns the canonical subscription row. Use its documented API
  // with the caller's session headers so the canary proves the same
  // organization authorization boundary as the owner checkout flow.
  const betterAuthApi = createAuth(env).api as unknown as BetterAuthSubscriptionApi
  const betterAuthSubscriptions = await betterAuthApi.listActiveSubscriptions({
    query: { referenceId: organizationId, customerType: 'organization' },
    headers: toWebRequest(event).headers,
  })
  const betterAuthSubscriptionRow = betterAuthSubscriptions.find(subscription => subscription.referenceId === organizationId) ?? null
  const betterAuthSubscription = betterAuthSubscriptionRow
    ? {
        id: betterAuthSubscriptionRow.id ?? null,
        referenceId: betterAuthSubscriptionRow.referenceId ?? null,
        plan: betterAuthSubscriptionRow.plan ?? null,
        status: betterAuthSubscriptionRow.status ?? null,
        stripeCustomerId: betterAuthSubscriptionRow.stripeCustomerId ?? null,
        stripeSubscriptionId: betterAuthSubscriptionRow.stripeSubscriptionId ?? null,
        periodStart: stableTimestamp(betterAuthSubscriptionRow.periodStart),
        periodEnd: stableTimestamp(betterAuthSubscriptionRow.periodEnd),
        cancelAtPeriodEnd: Boolean(betterAuthSubscriptionRow.cancelAtPeriodEnd),
      }
    : null

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

  const serviceAddonPurchases = await queryAll(db, `
    SELECT checkout_session_id, addon_type, stripe_payment_intent_id, created_at
    FROM service_addon_purchases
    WHERE organization_id = ?
    ORDER BY created_at DESC
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
    better_auth_subscription: betterAuthSubscription ?? null,
    entitlements: entitlements ?? [],
    site_plans: sitePlans ?? [],
    invoice_payments: invoicePayments ?? [],
    service_addon_purchases: serviceAddonPurchases ?? [],
    webhook_events: webhookEvents ?? [],
  })
})
