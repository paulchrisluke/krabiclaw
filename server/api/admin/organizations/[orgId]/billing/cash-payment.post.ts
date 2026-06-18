// POST /api/admin/organizations/[orgId]/billing/cash-payment
// Record a cash payment: creates Stripe customer + annual/monthly subscription + marks invoice paid out-of-band
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { getStripe, getPriceIdForPlan, setOrganizationEntitlementsFromPlan } from '~/server/utils/billing'

const ALLOWED_PLANS = ['growth', 'managed', 'seo_accelerator']

export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) return jsonResponse({ error: 'orgId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  if (!env.STRIPE_SECRET_KEY) return jsonResponse({ error: 'Stripe not configured' }, { status: 503 })

  let body: { plan?: string; interval?: string }
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid body' }, { status: 400 }) }

  const plan = body.plan?.trim()
  if (!plan || !ALLOWED_PLANS.includes(plan)) {
    return jsonResponse({ error: `Invalid plan. Allowed: ${ALLOWED_PLANS.join(', ')}` }, { status: 400 })
  }
  const interval: 'month' | 'year' = body.interval === 'year' ? 'year' : 'month'

  const org = await db.prepare(`
    SELECT o.name, o.slug, u.email AS owner_email, b.stripe_customer_id, b.stripe_subscription_id, b.status
    FROM organization o
    LEFT JOIN member m ON m.organizationId = o.id AND m.role = 'owner'
    LEFT JOIN user u ON u.id = m.userId
    LEFT JOIN organization_billing b ON b.organization_id = o.id
    WHERE o.id = ?
    LIMIT 1
  `).bind(orgId).first<{
    name: string
    slug: string | null
    owner_email: string | null
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    status: string | null
  }>()

  if (!org) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  if (org.status === 'active' && org.stripe_subscription_id) {
    return jsonResponse({ error: 'This organization already has an active subscription.' }, { status: 409 })
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
    await db.prepare(`
      INSERT INTO organization_billing (id, organization_id, stripe_customer_id, plan, status, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
      ON CONFLICT(organization_id) DO UPDATE SET
        stripe_customer_id = excluded.stripe_customer_id,
        updated_at = excluded.updated_at
    `).bind(`billing-${orgId}`, orgId, customerId, plan, new Date().toISOString()).run()
  }

  // Create subscription (send_invoice so we can finalize + mark paid out-of-band)
  const priceId = await getPriceIdForPlan(env, plan, interval)
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    collection_method: 'send_invoice',
    days_until_due: 0,
    metadata: { organization_id: orgId, plan, source: 'admin_cash_payment' },
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
  const paidInvoice = await stripe.invoices.pay(invoiceId, { paid_out_of_band: true })

  // Persist billing to D1 immediately — don't rely solely on the webhook
  const subItemId = subscription.items.data[0]?.id ?? null
  const periodEnd = subscription.billing_cycle_anchor
    ? new Date((subscription.billing_cycle_anchor as number) * 1000).toISOString()
    : null

  await db.prepare(`
    INSERT INTO organization_billing
      (id, organization_id, stripe_customer_id, stripe_subscription_id, stripe_subscription_item_id,
       plan, status, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(organization_id) DO UPDATE SET
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_subscription_item_id = excluded.stripe_subscription_item_id,
      plan = excluded.plan,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      updated_at = excluded.updated_at
  `).bind(
    `billing-${orgId}`, orgId, customerId, subscription.id, subItemId,
    plan, periodEnd, new Date().toISOString(),
  ).run()

  await setOrganizationEntitlementsFromPlan(env, db, orgId, plan)

  return jsonResponse({
    success: true,
    plan,
    interval,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    invoice_id: paidInvoice.id,
    invoice_status: paidInvoice.status,
    amount_paid: paidInvoice.amount_paid,
    current_period_end: periodEnd,
  })
})
