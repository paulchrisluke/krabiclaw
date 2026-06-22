import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { verifyStripeWebhook, setSiteEntitlementsFromPlan, getPlanFromStripePrice, applySiteSubscription } from '../../utils/billing'
import { completePaidSiteTransfer, deleteSiteCustomDomains } from '../../utils/site-transfer'
import Stripe from 'stripe'
import { getHeader } from 'h3'

interface ExpandedCheckoutSubscription {
  id?: string
  items?: { data?: Array<{ id?: string }> }
  billing_cycle_anchor?: number
  current_period_end?: number
}

interface SubscriptionTimingFields {
  billing_cycle_anchor?: number
  cancel_at_period_end?: boolean
  current_period_end?: number
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
  const env = cloudflareEnv(event)

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe webhook rejected: STRIPE_WEBHOOK_SECRET not configured')
    return jsonResponse({ error: 'Stripe webhook secret not configured' }, { status: 503 })
  }

  let body: string | Buffer | undefined
  try { body = await readRawBody(event) } catch {
    console.warn('Stripe webhook rejected: unable to read raw request body')
    return jsonResponse({ error: 'Invalid webhook request' }, { status: 400 })
  }
  const signature = getHeader(event, 'stripe-signature') || ''

  if (!body || !signature) {
    console.warn('Stripe webhook rejected: missing raw body or stripe-signature header')
    return jsonResponse({ error: 'Invalid webhook request' }, { status: 400 })
  }
  if (!env.STRIPE_SECRET_KEY) {
    console.error('Stripe webhook rejected: STRIPE_SECRET_KEY not configured')
    return jsonResponse({ error: 'Stripe secret key not configured' }, { status: 503 })
  }

  const e2eOverride = env.E2E_ALLOW_DEV_ROUTES === 'true'
  const providedDevSecret = getHeader(event, 'x-dev-route-secret') || ''
  const expectedDevSecret = env.E2E_DEV_ROUTE_SECRET || ''
  const e2eAuthorized = e2eOverride && expectedDevSecret && providedDevSecret && timingSafeEqualText(providedDevSecret, expectedDevSecret)

  const rawBody = body.toString()
  const verification = await verifyStripeWebhook(env, rawBody, signature)
  if (!verification.ok && !e2eAuthorized) {
    const configuredSecretSuffix = env.STRIPE_WEBHOOK_SECRET.slice(-6)
    const signatureParts = signature.split(',').map(part => part.trim())
    console.warn('Stripe webhook rejected: invalid signature', {
      configuredSecretSuffix,
      signatureParts,
      verificationError: verification.error,
      bodyLength: rawBody.length,
    })
    return jsonResponse({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY)
    const webhookEvent = verification.ok
      ? await stripe.webhooks.constructEventAsync(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
      : JSON.parse(rawBody) as Stripe.Event

    const existingEvent = await db.prepare(`SELECT id FROM stripe_webhook_events WHERE stripe_event_id = ? LIMIT 1`)
      .bind(webhookEvent.id).first()
    if (existingEvent) return jsonResponse({ received: true, duplicate: true })

    await db.prepare(`INSERT INTO stripe_webhook_events (id, stripe_event_id, event_type) VALUES (?, ?, ?)`)
      .bind(`webhook-${webhookEvent.id}`, webhookEvent.id, webhookEvent.type).run()

    switch (webhookEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(env, db, webhookEvent.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(env, db, webhookEvent.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(env, db, webhookEvent.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(db, webhookEvent.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(db, webhookEvent.data.object as Stripe.Invoice)
        break
      default:
        console.log(`Unhandled webhook event type: ${webhookEvent.type}`)
    }

    return jsonResponse({ received: true })
  } catch (error) {
    console.error('Webhook processing failed:', error)
    return jsonResponse({ error: 'Webhook processing failed' }, { status: 500 })
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function expandedSub(session: Stripe.Checkout.Session): ExpandedCheckoutSubscription | null {
  const subRef = session.subscription
  return typeof subRef === 'object' && subRef !== null ? subRef as ExpandedCheckoutSubscription : null
}

function checkoutSubscriptionId(session: Stripe.Checkout.Session): string {
  const expanded = expandedSub(session)
  return expanded?.id ?? (typeof session.subscription === 'string' ? session.subscription : '')
}

function checkoutSubscriptionPeriodEnd(session: Stripe.Checkout.Session): string | null {
  const expanded = expandedSub(session)
  return expanded?.current_period_end
    ? new Date(expanded.current_period_end * 1000).toISOString()
    : null
}

// Resolve site_id from subscription metadata; fall back to customer→org→site for old subscriptions
async function resolveSiteFromSubscription(
  db: D1Database,
  subscription: Stripe.Subscription,
): Promise<{ siteId: string; organizationId: string } | null> {
  const siteId = subscription.metadata?.site_id
  if (siteId) {
    const row = await db.prepare(`SELECT organization_id FROM sites WHERE id = ? LIMIT 1`)
      .bind(siteId).first<{ organization_id: string }>()
    if (row) return { siteId, organizationId: row.organization_id }
  }

  // Legacy: look up via stripe_customer_id → org → first site
  const customerId = subscription.customer as string
  const billing = await db.prepare(`
    SELECT ob.organization_id, s.id AS site_id
    FROM organization_billing ob
    JOIN sites s ON s.organization_id = ob.organization_id
    WHERE ob.stripe_customer_id = ?
    LIMIT 1
  `).bind(customerId).first<{ organization_id: string; site_id: string }>()
  if (!billing) return null
  return { siteId: billing.site_id, organizationId: billing.organization_id }
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  env: Record<string, string | undefined>,
  db: D1Database,
  session: Stripe.Checkout.Session,
) {
  const organizationId = session.metadata?.organization_id
  const siteId = session.metadata?.site_id

  // Credit top-up (org-scoped, no site needed)
  if (session.metadata?.type === 'credit_topup') {
    const credits = Number(session.metadata.credits)
    if (!organizationId || !Number.isFinite(credits) || credits <= 0) {
      console.error('Invalid credit topup metadata:', session.id)
      return
    }
    await handleCreditTopup(db, organizationId, credits)
    return
  }

  // Service add-on (org-scoped)
  if (session.metadata?.type === 'service_addon') {
    const addonType = session.metadata.addon_type
    if (!organizationId || !addonType) { console.error('Invalid service_addon metadata:', session.id); return }
    let paymentIntentId: string | null = null
    if (typeof session.payment_intent === 'string') paymentIntentId = session.payment_intent
    else if (session.payment_intent && typeof session.payment_intent === 'object') paymentIntentId = (session.payment_intent as { id?: string }).id ?? null
    await handleServiceAddon(db, organizationId, addonType, paymentIntentId)
    return
  }

  // Site transfer
  if (session.metadata?.type === 'site_transfer') {
    const plan = session.metadata?.plan
    const transferId = session.metadata?.transfer_request_id
    if (!organizationId || !plan || !transferId) { console.error('Invalid site transfer metadata:', session.id); return }
    const resolvedSiteId = siteId ?? session.metadata?.transfer_site_id ?? (await db.prepare(`SELECT id FROM sites WHERE organization_id = ? LIMIT 1`).bind(organizationId).first<{ id: string }>())?.id
    if (!resolvedSiteId) { console.error('No site found for site_transfer checkout:', session.id); return }
    const customerId = session.customer as string
    const subscriptionId = checkoutSubscriptionId(session)
    const expanded = expandedSub(session)
    // Reparent the site to the recipient org first — setSiteEntitlementsFromPlan's
    // `UPDATE sites SET plan ... WHERE organization_id = ?` only matches once
    // the site actually belongs to that org, otherwise it silently no-ops and
    // sites.plan (read by the transfer onboarding wizard) never updates.
    await completePaidSiteTransfer(env, db, transferId)
    await applySiteSubscription(db, resolvedSiteId, organizationId, customerId, subscriptionId, expanded?.items?.data?.[0]?.id ?? null, plan, checkoutSubscriptionPeriodEnd(session))
    return
  }

  // Standard plan subscription
  const plan = session.metadata?.plan
  const subscriptionId = checkoutSubscriptionId(session)
  if (!organizationId || !plan || !subscriptionId) {
    console.error('Missing metadata in checkout session:', session.id)
    return
  }

  const resolvedSiteId = siteId ?? (await db.prepare(`SELECT id FROM sites WHERE organization_id = ? LIMIT 1`).bind(organizationId).first<{ id: string }>())?.id
  if (!resolvedSiteId) { console.error('No site found for checkout:', session.id); return }

  const customerId = session.customer as string
  const expanded = expandedSub(session)
  await applySiteSubscription(db, resolvedSiteId, organizationId, customerId, subscriptionId, expanded?.items?.data?.[0]?.id ?? null, plan, checkoutSubscriptionPeriodEnd(session))
  console.log(`Checkout completed for site ${resolvedSiteId}, plan ${plan}`)
}

async function handleSubscriptionUpdated(
  env: Record<string, string | undefined>,
  db: D1Database,
  subscription: Stripe.Subscription,
) {
  const resolved = await resolveSiteFromSubscription(db, subscription)
  if (!resolved) { console.error('Site not found for subscription:', subscription.id); return }

  const { siteId, organizationId } = resolved
  const sub = subscription as Stripe.Subscription & SubscriptionTimingFields
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : new Date().toISOString()

  await db.prepare(`
    UPDATE site_billing SET stripe_subscription_id = ?, status = ?,
      current_period_end = ?, cancel_at_period_end = ?, updated_at = ?
    WHERE site_id = ?
  `).bind(subscription.id, subscription.status, currentPeriodEnd, sub.cancel_at_period_end === true, new Date().toISOString(), siteId).run()

  const plan = await getPlanFromSubscription(env, subscription)
  if (plan) {
    await setSiteEntitlementsFromPlan(db, siteId, organizationId, plan)
  } else {
    console.warn('Unrecognized Stripe price; falling back to free', { siteId, subscriptionId: subscription.id })
    await setSiteEntitlementsFromPlan(db, siteId, organizationId, 'free')
    await deleteSiteCustomDomains(env, db, siteId, 'system')
  }
  console.log(`Subscription updated for site ${siteId}, status ${subscription.status}`)
}

async function handleSubscriptionDeleted(
  env: Record<string, string | undefined>,
  db: D1Database,
  subscription: Stripe.Subscription,
) {
  const resolved = await resolveSiteFromSubscription(db, subscription)
  if (!resolved) { console.error('Site not found for deleted subscription:', subscription.id); return }

  const { siteId, organizationId } = resolved
  await db.prepare(`
    UPDATE site_billing SET stripe_subscription_id = NULL, status = 'canceled',
      current_period_end = NULL, cancel_at_period_end = false, updated_at = ?
    WHERE site_id = ?
  `).bind(new Date().toISOString(), siteId).run()

  await setSiteEntitlementsFromPlan(db, siteId, organizationId, 'free')
  await deleteSiteCustomDomains(env, db, siteId, 'system')
  console.log(`Subscription deleted for site ${siteId}`)
}

async function handlePaymentSucceeded(db: D1Database, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  const billing = await db.prepare(`SELECT organization_id FROM organization_billing WHERE stripe_customer_id = ? LIMIT 1`).bind(customerId).first<{ organization_id: string }>()
  if (!billing) { console.error('Org not found for payment_succeeded, customer:', customerId); return }
  console.log(`Payment succeeded for org ${billing.organization_id}`)
}

async function handlePaymentFailed(db: D1Database, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  const billing = await db.prepare(`SELECT organization_id FROM organization_billing WHERE stripe_customer_id = ? LIMIT 1`).bind(customerId).first<{ organization_id: string }>()
  if (!billing) { console.error('Org not found for payment_failed, customer:', customerId); return }
  console.log(`Payment failed for org ${billing.organization_id}`)
}

async function handleServiceAddon(db: D1Database, organizationId: string, addonType: string, paymentIntentId: string | null) {
  const now = new Date().toISOString()
  await db.prepare(`INSERT OR IGNORE INTO service_addon_purchases (id, organization_id, addon_type, stripe_payment_intent_id, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), organizationId, addonType, paymentIntentId, now).run()
}

async function handleCreditTopup(db: D1Database, organizationId: string, credits: number) {
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(organization_id) DO UPDATE SET
      balance = balance + excluded.balance,
      last_topped_up_at = excluded.last_topped_up_at,
      updated_at = excluded.updated_at
  `).bind(organizationId, credits, now, now).run()
}

async function getPlanFromSubscription(env: Record<string, string | undefined>, subscription: Stripe.Subscription): Promise<string | null> {
  const priceId = subscription.items.data[0]?.price.id
  if (!priceId) return null
  return getPlanFromStripePrice(env, priceId)
}
