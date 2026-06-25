import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { verifyStripeWebhook, setSiteEntitlementsFromPlan, getPlanFromStripePrice, applySiteSubscription, getStripe } from '../../utils/billing'
import { completePaidSiteTransfer, deleteSiteCustomDomains } from '../../utils/site-transfer'
import { sendGa4Event } from '../../utils/ga4-measurement-protocol'
import { execute, queryFirst } from '~/server/db'
import type Stripe from 'stripe'
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

interface InvoiceLinePeriodFields {
  start?: number
  end?: number
}

interface ExpandedInvoiceLine {
  period?: InvoiceLinePeriodFields | null
}

interface ExpandedInvoice {
  period_end?: number
  lines?: {
    data?: ExpandedInvoiceLine[]
  }
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
    const webhookEvent = verification.ok
      ? verification.event
      : JSON.parse(rawBody) as Stripe.Event

    const existingEvent = await queryFirst(db, `SELECT id FROM stripe_webhook_events WHERE stripe_event_id = ? LIMIT 1`, [webhookEvent.id])
    if (existingEvent) return jsonResponse({ received: true, duplicate: true })

    // stripe_event_id has a UNIQUE constraint, so a concurrent duplicate insert
    // throws here rather than silently double-processing; the outer try/catch
    // turns that into a 500 and Stripe retries, which is safe but not pretty.
    // Preserved as-is — not introducing a fix for this pre-existing race in this pass.
    await execute(db, `INSERT INTO stripe_webhook_events (id, stripe_event_id, event_type) VALUES (?, ?, ?)`, [`webhook-${webhookEvent.id}`, webhookEvent.id, webhookEvent.type])

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
        await handlePaymentSucceeded(env, db, webhookEvent.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(env, db, webhookEvent.data.object as Stripe.Invoice)
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

async function hydrateSubscriptionForBilling(
  env: Record<string, string | undefined>,
  subscription: Stripe.Subscription,
): Promise<Stripe.Subscription> {
  const hasCurrentPeriodEnd = typeof (subscription as Stripe.Subscription & SubscriptionTimingFields).current_period_end === 'number'
  const hasPriceId = Boolean(subscription.items.data[0]?.price?.id)
  if (hasCurrentPeriodEnd && hasPriceId) return subscription
  if (!subscription.id) return subscription

  try {
    return await getStripe(env).subscriptions.retrieve(subscription.id, {
      expand: ['items.data.price.product', 'latest_invoice.lines'],
    })
  } catch (error) {
    console.error('stripe_subscription_hydration_failed', {
      subscriptionId: subscription.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return subscription
  }
}

function subscriptionPeriodEndIso(subscription: Stripe.Subscription): string | null {
  const sub = subscription as Stripe.Subscription & SubscriptionTimingFields & {
    latest_invoice?: string | ExpandedInvoice | null
  }

  if (typeof sub.current_period_end === 'number') {
    return new Date(sub.current_period_end * 1000).toISOString()
  }

  const latestInvoice = typeof sub.latest_invoice === 'object' && sub.latest_invoice !== null
    ? sub.latest_invoice as ExpandedInvoice
    : null
  const linePeriodEnd = latestInvoice?.lines?.data?.[0]?.period?.end
  if (typeof linePeriodEnd === 'number') {
    return new Date(linePeriodEnd * 1000).toISOString()
  }

  if (typeof latestInvoice?.period_end === 'number') {
    return new Date(latestInvoice.period_end * 1000).toISOString()
  }

  return null
}

// Resolve site_id from subscription metadata. All subscriptions must have site_id in metadata
// for multi-site support. Legacy fallback removed - old subscriptions without site_id will fail.
async function resolveSiteFromSubscription(
  db: D1Database,
  subscription: Stripe.Subscription,
): Promise<{ siteId: string; organizationId: string } | null> {
  const siteId = subscription.metadata?.site_id
  if (!siteId) {
    console.error('Subscription missing site_id in metadata:', subscription.id)
    return null
  }

  const row = await queryFirst<{ organization_id: string }>(db, `SELECT organization_id FROM sites WHERE id = ? LIMIT 1`, [siteId])
  if (!row) {
    console.error('Site not found for subscription site_id:', { subscriptionId: subscription.id, siteId })
    return null
  }
  return { siteId, organizationId: row.organization_id }
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
    const transferSiteId = session.metadata?.transfer_site_id
    if (siteId && transferSiteId && siteId !== transferSiteId) {
      console.error('Mismatched site_id and transfer_site_id in site_transfer checkout:', { sessionId: session.id, siteId, transferSiteId })
      return
    }
    const resolvedSiteId = transferSiteId ?? siteId
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
  if (!organizationId || !siteId || !plan || !subscriptionId) {
    console.error('Missing metadata in checkout session:', session.id)
    return
  }

  const resolvedSiteId = siteId

  // Stripe session metadata is set at checkout-creation time, but re-verify the
  // site/org pairing here rather than trusting it blindly — applySiteSubscription
  // would otherwise attach billing to whatever site_id is in the metadata even if
  // it belongs to a different organization.
  const siteOwnership = await queryFirst<{ id: string }>(db, `SELECT id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1`, [resolvedSiteId, organizationId])
  if (!siteOwnership) {
    console.error('Site does not belong to organization in checkout metadata:', { sessionId: session.id, siteId: resolvedSiteId, organizationId })
    return
  }

  const customerId = session.customer as string
  const expanded = expandedSub(session)
  await applySiteSubscription(db, resolvedSiteId, organizationId, customerId, subscriptionId, expanded?.items?.data?.[0]?.id ?? null, plan, checkoutSubscriptionPeriodEnd(session))
  console.log(`Checkout completed for site ${resolvedSiteId}, plan ${plan}`)

  // This is the revenue-confirming event GA4 should treat as the key event for
  // billing — checkout_started (browser-side) only signals intent, this signals
  // Stripe actually completed the subscription.
  await sendGa4Event(env, session.metadata?.ga_client_id, {
    name: 'subscription_created',
    params: {
      plan,
      value: typeof session.amount_total === 'number' ? session.amount_total / 100 : undefined,
      currency: session.currency?.toUpperCase(),
      transaction_id: subscriptionId,
    },
  })
}

async function handleSubscriptionUpdated(
  env: Record<string, string | undefined>,
  db: D1Database,
  subscription: Stripe.Subscription,
) {
  const canonicalSubscription = await hydrateSubscriptionForBilling(env, subscription)
  const resolved = await resolveSiteFromSubscription(db, canonicalSubscription)
  if (!resolved) { console.error('Site not found for subscription:', subscription.id); return }

  const { siteId, organizationId } = resolved
  const sub = canonicalSubscription as Stripe.Subscription & SubscriptionTimingFields
  const existingBilling = await queryFirst<{ current_period_end: string | null; plan: string | null }>(db, `
    SELECT current_period_end, plan FROM site_billing WHERE site_id = ? LIMIT 1
  `, [siteId])
  const currentPeriodEnd = subscriptionPeriodEndIso(canonicalSubscription)
    ?? existingBilling?.current_period_end
    ?? null

  await execute(db, `
    UPDATE site_billing SET stripe_subscription_id = ?, status = ?,
      current_period_end = ?, cancel_at_period_end = ?, updated_at = ?
    WHERE site_id = ?
  `, [canonicalSubscription.id, canonicalSubscription.status, currentPeriodEnd, sub.cancel_at_period_end === true, new Date().toISOString(), siteId])

  const plan = await getPlanFromSubscription(env, canonicalSubscription)
  if (plan) {
    await setSiteEntitlementsFromPlan(db, siteId, organizationId, plan)
  } else {
    console.warn('Unrecognized Stripe price; falling back to free', { siteId, subscriptionId: canonicalSubscription.id })
    await setSiteEntitlementsFromPlan(db, siteId, organizationId, 'free')
    await deleteSiteCustomDomains(env, db, siteId, 'system')
  }

  const previousPlan = existingBilling?.plan ?? null
  if (plan && previousPlan && plan !== previousPlan) {
    const isUpgrade = (PLAN_RANK[plan] ?? 0) > (PLAN_RANK[previousPlan] ?? 0)
    await sendGa4Event(env, canonicalSubscription.metadata?.ga_client_id, {
      name: isUpgrade ? 'plan_upgraded' : 'plan_downgraded',
      params: { plan, previous_plan: previousPlan },
    })
  }
  console.log(`Subscription updated for site ${siteId}, status ${canonicalSubscription.status}`)
}

const PLAN_RANK: Record<string, number> = { free: 0, growth: 1, managed: 2, seo_accelerator: 3 }

async function handleSubscriptionDeleted(
  env: Record<string, string | undefined>,
  db: D1Database,
  subscription: Stripe.Subscription,
) {
  const resolved = await resolveSiteFromSubscription(db, subscription)
  if (!resolved) { console.error('Site not found for deleted subscription:', subscription.id); return }

  const { siteId, organizationId } = resolved
  const existingBilling = await queryFirst<{ plan: string | null }>(db, `SELECT plan FROM site_billing WHERE site_id = ? LIMIT 1`, [siteId])
  await execute(db, `
    UPDATE site_billing SET stripe_subscription_id = NULL, status = 'canceled',
      current_period_end = NULL, cancel_at_period_end = false, updated_at = ?
    WHERE site_id = ?
  `, [new Date().toISOString(), siteId])

  await setSiteEntitlementsFromPlan(db, siteId, organizationId, 'free')
  await deleteSiteCustomDomains(env, db, siteId, 'system')
  await sendGa4Event(env, subscription.metadata?.ga_client_id, {
    name: 'subscription_cancelled',
    params: { plan: existingBilling?.plan ?? undefined },
  })
  console.log(`Subscription deleted for site ${siteId}`)
}

async function handlePaymentSucceeded(env: Record<string, string | undefined>, db: D1Database, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  const billing = await queryFirst<{ organization_id: string }>(db, `SELECT organization_id FROM organization_billing WHERE stripe_customer_id = ? LIMIT 1`, [customerId])
  if (!billing) { console.error('Org not found for payment_succeeded, customer:', customerId); return }
  console.log(`Payment succeeded for org ${billing.organization_id}`)
}

async function handlePaymentFailed(env: Record<string, string | undefined>, db: D1Database, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  const billing = await queryFirst<{ organization_id: string }>(db, `SELECT organization_id FROM organization_billing WHERE stripe_customer_id = ? LIMIT 1`, [customerId])
  if (!billing) { console.error('Org not found for payment_failed, customer:', customerId); return }

  const gaClientId = await resolveGaClientIdFromInvoiceSubscription(env, invoice)
  await sendGa4Event(env, gaClientId, {
    name: 'payment_failed',
    params: { organization_id: billing.organization_id },
  })
  console.log(`Payment failed for org ${billing.organization_id}`)
}

async function resolveGaClientIdFromInvoiceSubscription(
  env: Record<string, string | undefined>,
  invoice: Stripe.Invoice,
): Promise<string | undefined> {
  const subRef = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription
  if (!subRef) return undefined
  if (typeof subRef === 'object') return subRef.metadata?.ga_client_id
  try {
    const subscription = await getStripe(env).subscriptions.retrieve(subRef)
    return subscription.metadata?.ga_client_id
  } catch (error) {
    console.error('Failed to retrieve subscription for payment_failed GA4 event:', subRef, error)
    return undefined
  }
}

async function handleServiceAddon(db: D1Database, organizationId: string, addonType: string, paymentIntentId: string | null) {
  const now = new Date().toISOString()
  await execute(db, `INSERT OR IGNORE INTO service_addon_purchases (id, organization_id, addon_type, stripe_payment_intent_id, created_at) VALUES (?, ?, ?, ?, ?)`, [crypto.randomUUID(), organizationId, addonType, paymentIntentId, now])
}

async function handleCreditTopup(db: D1Database, organizationId: string, credits: number) {
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(organization_id) DO UPDATE SET
      balance = balance + excluded.balance,
      last_topped_up_at = excluded.last_topped_up_at,
      updated_at = excluded.updated_at
  `, [organizationId, credits, now, now])
}

async function getPlanFromSubscription(env: Record<string, string | undefined>, subscription: Stripe.Subscription): Promise<string | null> {
  const priceId = subscription.items.data[0]?.price.id
  if (!priceId) return null
  return getPlanFromStripePrice(env, priceId)
}
