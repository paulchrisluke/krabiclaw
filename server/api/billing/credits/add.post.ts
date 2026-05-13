// POST /api/billing/credits/add
// Dev: pass { amount } to top up directly.
// Production: pass { bundle: 500 | 2500 | 5000 } to create a Stripe checkout session.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe } from '~/server/utils/billing'

const BUNDLE_PRICE_MAP: Record<number, keyof NodeJS.ProcessEnv> = {
  500: 'STRIPE_PRICE_CREDITS_500',
  2500: 'STRIPE_PRICE_CREDITS_2500',
  5000: 'STRIPE_PRICE_CREDITS_5000',
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({}))

  // Dev-only direct top-up
  if (process.env.NODE_ENV === 'development' && body.amount) {
    const amount = Number(body.amount)
    const member = await db.prepare(
      'SELECT organizationId FROM member WHERE userId = ? LIMIT 1'
    ).bind(session.user.id).first()
    if (!member) return jsonResponse({ error: 'No organisation found' }, { status: 404 })

    const orgId = member.organizationId as string
    const now = new Date().toISOString()
    const existing = await db.prepare(
      'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1'
    ).bind(orgId).first()

    if (existing) {
      await db.prepare(
        'UPDATE ai_credits SET balance = balance + ?, last_topped_up_at = ?, updated_at = ? WHERE organization_id = ?'
      ).bind(amount, now, now, orgId).run()
    } else {
      await db.prepare(
        'INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, updated_at) VALUES (?, ?, 0, ?, ?)'
      ).bind(orgId, amount, now, now).run()
    }
    const updated = await db.prepare(
      'SELECT balance FROM ai_credits WHERE organization_id = ? LIMIT 1'
    ).bind(orgId).first()
    return jsonResponse({ success: true, balance: updated?.balance ?? amount })
  }

  // Production: create Stripe checkout for credit bundle
  const bundle = Number(body.bundle)
  const priceEnvKey = BUNDLE_PRICE_MAP[bundle]
  if (!priceEnvKey) {
    return jsonResponse({ error: 'Invalid bundle. Choose 500, 2500, or 5000.' }, { status: 400 })
  }

  const priceId = env[priceEnvKey] as string | undefined
  if (!priceId) {
    return jsonResponse({ error: 'Credit bundle not configured' }, { status: 503 })
  }

  const member = await db.prepare(
    'SELECT organizationId FROM member WHERE userId = ? LIMIT 1'
  ).bind(session.user.id).first() as { organizationId: string } | null
  if (!member) return jsonResponse({ error: 'No organisation found' }, { status: 404 })

  const orgId = member.organizationId

  const billing = await db.prepare(
    'SELECT stripe_customer_id FROM organization_billing WHERE organization_id = ? LIMIT 1'
  ).bind(orgId).first() as { stripe_customer_id: string | null } | null

  const stripe = getStripe(env)
  const origin = getRequestURL(event).origin

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: billing?.stripe_customer_id || undefined,
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard/billing?credits_success=true`,
    cancel_url: `${origin}/dashboard/billing`,
    metadata: {
      organization_id: orgId,
      type: 'credit_topup',
      credits: String(bundle),
    },
  })

  return jsonResponse({ checkoutUrl: checkoutSession.url })
})
