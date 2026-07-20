// POST /api/billing/site-subscribe
// Creates a new per-site Stripe subscription on the org's existing customer +
// saved default payment method (no Checkout redirect). Used when a paid org adds
// another site and wants it on a paid plan immediately. If the org has no saved
// payment method, callers should fall back to /api/billing/checkout instead.
// body: { siteId, plan, interval?, txId? }
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, getPriceIdForPlan, requireBillingAccess, applySiteSubscription } from '~/server/utils/billing'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { queryFirst } from '~/server/db'
import type Stripe from 'stripe'

const ALLOWED_PLANS = ['growth', 'managed', 'seo_accelerator']

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  if (!env.STRIPE_SECRET_KEY) return jsonResponse({ error: 'Stripe not configured' }, { status: 503 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event) as { siteId?: string; plan?: string; interval?: 'month' | 'year'; txId?: string }
  const siteId = body.siteId
  const plan = body.plan
  const interval = body.interval ?? 'month'
  const txId = typeof body.txId === 'string' ? body.txId.trim() : ''
  if (!siteId) return jsonResponse({ error: 'siteId is required' }, { status: 400 })
  if (!plan || !ALLOWED_PLANS.includes(plan)) {
    return jsonResponse({ error: `Invalid plan. Allowed values are ${ALLOWED_PLANS.join(', ')}` }, { status: 400 })
  }
  if (!txId) return jsonResponse({ error: 'txId is required' }, { status: 400 })

  const site = await queryFirst<{ id: string; organization_id: string }>(
    db, `SELECT id, organization_id FROM sites WHERE id = ? LIMIT 1`, [siteId],
  )
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })
  const orgId = site.organization_id

  // Cross-check the site's own org against the current dashboard URL context (when
  // present) — a stale client-side siteId must never act on a different org than
  // the one the caller's URL/header names.
  const organization = await resolveRequestedOrganization(event, db, session.user.id, {
    explicitOrganizationId: orgId,
  })
  if (!organization) return jsonResponse({ error: 'Site does not belong to your organization' }, { status: 403 })

  try {
    await requireBillingAccess(env, db, orgId, session.user.id)
  } catch {
    return jsonResponse({ error: 'Only owners can manage billing' }, { status: 403 })
  }

  const existingSiteBilling = await queryFirst<{ stripe_subscription_id: string | null }>(db, `
    SELECT stripe_subscription_id FROM site_billing WHERE site_id = ? AND status = 'active' LIMIT 1
  `, [siteId])
  if (existingSiteBilling?.stripe_subscription_id) {
    return jsonResponse({ error: 'This site already has an active subscription' }, { status: 409 })
  }

  const orgBilling = await queryFirst<{ stripe_customer_id: string | null }>(db, `
    SELECT stripe_customer_id FROM organization_billing WHERE organization_id = ? LIMIT 1
  `, [orgId])
  if (!orgBilling?.stripe_customer_id) {
    return jsonResponse({ error: 'No saved payment method found', requiresCheckout: true }, { status: 402 })
  }
  const customerId = orgBilling.stripe_customer_id

  const stripe = getStripe(env)

  const customer = await stripe.customers.retrieve(customerId, {
    expand: ['invoice_settings.default_payment_method'],
  }) as Stripe.Customer
  const pm = customer.invoice_settings?.default_payment_method
  const pmId = typeof pm === 'string' ? pm : pm?.id
  if (!pmId) {
    return jsonResponse({ error: 'No saved payment method found', requiresCheckout: true }, { status: 402 })
  }

  let priceId: string
  try {
    priceId = await getPriceIdForPlan(env, plan, interval)
  } catch (error) {
    console.error('Invalid Stripe pricing configuration', { plan, interval, error })
    return jsonResponse({ error: 'Billing is temporarily unavailable for the selected plan' }, { status: 503 })
  }

  let subscription: Stripe.Subscription
  try {
    subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      default_payment_method: pmId,
      payment_behavior: 'error_if_incomplete',
      metadata: { organization_id: orgId, site_id: siteId, plan },
    }, { idempotencyKey: txId })
  } catch (err) {
    const stripeErr = err as { code?: string }
    if (stripeErr.code === 'authentication_required' || stripeErr.code === 'card_declined') {
      return jsonResponse({ error: 'Payment requires authentication', requiresCheckout: true }, { status: 402 })
    }
    throw err
  }

  const sub = subscription as Stripe.Subscription & { current_period_end?: number }
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null

  await applySiteSubscription(
    db, siteId, orgId, customerId, subscription.id,
    subscription.items.data[0]?.id ?? null, plan, periodEnd,
  )

  return jsonResponse({ success: true, plan, subscriptionId: subscription.id })
})
