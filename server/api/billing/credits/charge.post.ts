// POST /api/billing/credits/charge
// Charges the org's saved default payment method directly via PaymentIntent (no redirect).
// On success, credits are topped up immediately.
// body: { bundle: 500 | 2500 | 5000 }
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, requireBillingAccess } from '~/server/utils/billing'
import { BUNDLE_AMOUNTS, VALID_BUNDLES } from '~/shared/creditBundles'
import { execute, queryFirst } from '~/server/db'
import type Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const member = await queryFirst<{ organizationId: string }>(
    db, 'SELECT organizationId FROM member WHERE userId = ? LIMIT 1', [session.user.id],
  )
  if (!member) return jsonResponse({ error: 'No Organization found' }, { status: 404 })

  const orgId = member.organizationId

  try {
    await requireBillingAccess(env, db, orgId, session.user.id)
  } catch {
    return jsonResponse({ error: 'Only owners can purchase credits' }, { status: 403 })
  }

  const body = await readBody(event)
  const bundle = Number(body?.bundle)
  const txId = body?.txId as string | undefined
  const enableAutoTopup = body?.enableAutoTopup === true
  const autoTopupBundle = body?.autoTopupBundle !== undefined ? Number(body.autoTopupBundle) : bundle
  const amount = BUNDLE_AMOUNTS[bundle]
  if (!amount) return jsonResponse({ error: 'Invalid bundle. Choose 500, 2500, or 5000.' }, { status: 400 })

  const billing = await queryFirst<{ stripe_customer_id: string | null }>(
    db, 'SELECT stripe_customer_id FROM organization_billing WHERE organization_id = ? LIMIT 1', [orgId],
  )

  if (!billing?.stripe_customer_id) {
    return jsonResponse({ error: 'No saved payment method found', requiresCheckout: true }, { status: 402 })
  }

  const stripe = getStripe(env)

  const customer = await stripe.customers.retrieve(billing.stripe_customer_id, {
    expand: ['invoice_settings.default_payment_method'],
  }) as Stripe.Customer

  const pm = customer.invoice_settings?.default_payment_method
  const pmId = typeof pm === 'string' ? pm : pm?.id
  if (!pmId) {
    return jsonResponse({ error: 'No saved payment method found', requiresCheckout: true }, { status: 402 })
  }

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: billing.stripe_customer_id,
      payment_method: pmId,
      confirm: true,
      off_session: true,
      metadata: { organization_id: orgId, type: 'credit_topup', credits: String(bundle) },
    }, { idempotencyKey: txId })
  } catch (err) {
    const stripeErr = err as { code?: string }
    // Card declined or requires authentication — caller should fall back to Checkout
    if (stripeErr.code === 'authentication_required' || stripeErr.code === 'card_declined') {
      return jsonResponse({ error: 'Payment requires authentication', requiresCheckout: true }, { status: 402 })
    }
    throw err
  }

  if (intent.status !== 'succeeded') {
    return jsonResponse({ error: 'Payment did not succeed', requiresCheckout: true }, { status: 402 })
  }

  // Top up credits atomically
  const now = new Date().toISOString()
  await execute(db,
    `INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, updated_at)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(organization_id) DO UPDATE SET
       balance = balance + excluded.balance,
       last_topped_up_at = excluded.last_topped_up_at,
       updated_at = excluded.updated_at`,
    [orgId, bundle, now, now],
  )

  // Persist auto top-up preference if the user toggled it during purchase
  if (enableAutoTopup) {
    const validBundle = (VALID_BUNDLES as readonly number[]).includes(autoTopupBundle) ? autoTopupBundle : bundle
    await execute(db,
      `INSERT INTO organization_billing (id, organization_id, auto_topup_enabled, auto_topup_bundle, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(organization_id) DO UPDATE SET
         auto_topup_enabled = 1,
         auto_topup_bundle = excluded.auto_topup_bundle,
         updated_at = excluded.updated_at`,
      [`ob-${orgId}`, orgId, validBundle, now],
    )
  }

  const updated = await queryFirst<{ balance: number }>(
    db, 'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1', [orgId],
  )

  return jsonResponse({ success: true, credits: bundle, balance: updated?.balance ?? bundle })
})
