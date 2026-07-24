// POST /api/admin/organizations/[orgId]/billing/cash-payment
// Record a cash payment: creates Stripe customer + annual/monthly subscription + marks invoice paid out-of-band
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { getStripe, getPriceIdForPlan, setSiteEntitlementsFromPlan } from '~/server/utils/billing'
import { execute, queryFirst } from '~/server/db'

const ALLOWED_PLANS = ['growth', 'managed', 'seo_accelerator']

export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) return jsonResponse({ error: 'orgId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['billing'] })
  if (permissionDenied) return permissionDenied

  if (!env.STRIPE_SECRET_KEY) return jsonResponse({ error: 'Stripe not configured' }, { status: 503 })

  let body: { plan?: string; interval?: string; siteId?: string; localRate?: number; localCurrency?: string }
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid body' }, { status: 400 }) }

  const plan = body.plan?.trim()
  if (!plan || !ALLOWED_PLANS.includes(plan)) {
    return jsonResponse({ error: `Invalid plan. Allowed: ${ALLOWED_PLANS.join(', ')}` }, { status: 400 })
  }
  const interval: 'month' | 'year' = body.interval === 'year' ? 'year' : 'month'
  const siteId = body.siteId?.trim()
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })
  const localRate = body.localRate ? Number(body.localRate) : null
  const localCurrency = body.localCurrency?.trim() ?? null

  const org = await queryFirst<{
    name: string
    slug: string | null
    owner_email: string | null
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    status: string | null
  }>(db, `
    SELECT o.name, o.slug, u.email AS owner_email, ob.stripe_customer_id, sb.stripe_subscription_id, sb.status
    FROM organization o
    LEFT JOIN member m ON m.organizationId = o.id AND m.role = 'owner'
    LEFT JOIN user u ON u.id = m.userId
    LEFT JOIN organization_billing ob ON ob.organization_id = o.id
    LEFT JOIN site_billing sb ON sb.site_id = ? AND sb.organization_id = o.id
    WHERE o.id = ?
    LIMIT 1
  `, [siteId, orgId])

  if (!org) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  if (org.status === 'active' && org.stripe_subscription_id) {
    return jsonResponse({ error: 'This organization already has an active subscription.' }, { status: 409 })
  }

  // Preflight site eligibility check - ensure siteId exists and is associated with this organization
  const siteEligibility = await queryFirst<{ id: string }>(db, `
    SELECT id FROM sites
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `, [siteId, orgId])

  if (!siteEligibility) {
    return jsonResponse({ error: 'Site not found or not eligible for this organization.' }, { status: 404 })
  }

  const stripe = getStripe(env)

  // Get or create Stripe customer
  let customerId = org.stripe_customer_id ?? null
  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId)
      if ('deleted' in existing && existing.deleted) customerId = null
    } catch {
      customerId = null
    }
  }

  if (!customerId) {
    if (!org.owner_email) return jsonResponse({ error: 'No owner email found for this organization.' }, { status: 422 })
    const customer = await stripe.customers.create({
      email: org.owner_email,
      name: org.name,
      metadata: { organization_id: orgId },
    })
    customerId = customer.id
    await execute(db, `
      INSERT INTO organization_billing (id, organization_id, stripe_customer_id, plan, status, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
      ON CONFLICT(organization_id) DO UPDATE SET
        stripe_customer_id = excluded.stripe_customer_id,
        updated_at = excluded.updated_at
    `, [`billing-${orgId}`, orgId, customerId, plan, new Date().toISOString()])
    await execute(db, `
      INSERT INTO site_billing (id, site_id, organization_id, stripe_customer_id, plan, status, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
      ON CONFLICT(site_id) DO UPDATE SET
        organization_id = excluded.organization_id,
        stripe_customer_id = excluded.stripe_customer_id,
        updated_at = excluded.updated_at
    `, [`billing-${siteId}`, siteId, orgId, customerId, plan, new Date().toISOString()])
  }

  // Create subscription (send_invoice + auto_advance=false so Stripe never auto-emails the client)
  const priceId = await getPriceIdForPlan(env, plan, interval)
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    collection_method: 'send_invoice',
    days_until_due: 0,
    // Prevent Stripe from auto-finalizing renewal invoices — we handle reminders and mark paid manually
    // @ts-expect-error auto_advance not yet in SDK types for subscription create
    auto_advance: false,
    metadata: { organization_id: orgId, site_id: siteId, plan, source: 'admin_cash_payment', payment_method: 'cash' },
  }, {
    idempotencyKey: `cash-payment-subscription-${orgId}-${siteId}-${plan}-${interval}`,
  })

  // Retrieve and finalize the invoice
  const invoiceRef = subscription.latest_invoice
  const invoiceId = typeof invoiceRef === 'string' ? invoiceRef : invoiceRef?.id
  if (!invoiceId) {
    return jsonResponse({ error: 'Subscription created but no invoice found.' }, { status: 500 })
  }

  let invoice = await stripe.invoices.retrieve(invoiceId)
  if (invoice.status === 'draft') {
    invoice = await stripe.invoices.finalizeInvoice(invoiceId)
  }

  if (invoice.status !== 'open') {
    return jsonResponse({ error: `Invoice in unexpected state: ${invoice.status}` }, { status: 500 })
  }

  // Mark paid out-of-band (cash collected in person)
  const paidInvoice = await stripe.invoices.pay(invoiceId, { paid_out_of_band: true }, {
    idempotencyKey: `cash-payment-invoice-${invoiceId}`,
  })

  // Persist billing to D1 immediately — don't rely solely on the webhook
  const subItemId = subscription.items.data[0]?.id ?? null
  const periodEnd = paidInvoice.lines.data[0]?.period?.end
    ? new Date(paidInvoice.lines.data[0].period.end * 1000).toISOString()
    : null

  await execute(db, `
    INSERT INTO site_billing
      (id, site_id, organization_id, stripe_customer_id, stripe_subscription_id, stripe_subscription_item_id,
       plan, status, current_period_end, payment_method, local_rate, local_currency, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 'cash', ?, ?, ?)
    ON CONFLICT(site_id) DO UPDATE SET
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_subscription_item_id = excluded.stripe_subscription_item_id,
      plan = excluded.plan,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      payment_method = 'cash',
      local_rate = excluded.local_rate,
      local_currency = excluded.local_currency,
      updated_at = excluded.updated_at
  `, [
    `billing-${siteId}`, siteId, orgId, customerId, subscription.id, subItemId,
    plan, periodEnd, localRate, localCurrency, new Date().toISOString(),
  ])

  await setSiteEntitlementsFromPlan(db, siteId, orgId, plan)

  return jsonResponse({
    success: true,
    plan,
    interval,
    payment_method: 'cash',
    local_rate: localRate,
    local_currency: localCurrency,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    invoice_id: paidInvoice.id,
    invoice_status: paidInvoice.status,
    amount_paid: paidInvoice.amount_paid,
    current_period_end: periodEnd,
  })
})
