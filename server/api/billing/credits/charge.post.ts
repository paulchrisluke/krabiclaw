// POST /api/billing/credits/charge
// Charges the org's saved default payment method directly via PaymentIntent (no redirect).
// On success, credits are topped up immediately.
// body: { bundle: 500 | 2500 | 5000 }
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, requireBillingAccess } from '~/server/utils/billing'
import type Stripe from 'stripe'

const BUNDLE_AMOUNTS: Record<number, number> = {
  500: 900,   // $9.00
  2500: 2900, // $29.00
  5000: 4900, // $49.00
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const member = await db.prepare(
    'SELECT organizationId FROM member WHERE userId = ? LIMIT 1'
  ).bind(session.user.id).first<{ organizationId: string }>()
  if (!member) return jsonResponse({ error: 'No organisation found' }, { status: 404 })

  const orgId = member.organizationId

  try {
    await requireBillingAccess(env, db, orgId, session.user.id)
  } catch {
    return jsonResponse({ error: 'Only owners can purchase credits' }, { status: 403 })
  }

  const body = await readBody(event)
  const bundle = Number(body?.bundle)
  const txId = body?.txId as string | undefined
  const amount = BUNDLE_AMOUNTS[bundle]
  if (!amount) return jsonResponse({ error: 'Invalid bundle. Choose 500, 2500, or 5000.' }, { status: 400 })

  const billing = await db.prepare(
    'SELECT stripe_customer_id FROM organization_billing WHERE organization_id = ? LIMIT 1'
  ).bind(orgId).first<{ stripe_customer_id: string | null }>()

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
  await db.prepare(
    `INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, updated_at)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(organization_id) DO UPDATE SET
       balance = balance + excluded.balance,
       last_topped_up_at = excluded.last_topped_up_at,
       updated_at = excluded.updated_at`
  ).bind(orgId, bundle, now, now).run()

  const updated = await db.prepare(
    'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1'
  ).bind(orgId).first<{ balance: number }>()

  return jsonResponse({ success: true, credits: bundle, balance: updated?.balance ?? bundle })
})
