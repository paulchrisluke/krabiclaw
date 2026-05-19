// GET /api/billing/payment-method
// Returns the org's default saved payment method (card brand, last4, expiry) or null.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, requireBillingAccess } from '~/server/utils/billing'
import Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const member = await db.prepare(
    'SELECT organizationId FROM member WHERE userId = ? LIMIT 1'
  ).bind(session.user.id).first<{ organizationId: string }>()
  if (!member) return jsonResponse({ card: null })

  try {
    await requireBillingAccess(env, db, member.organizationId, session.user.id)
  } catch {
    return jsonResponse({ card: null })
  }

  const billing = await db.prepare(
    'SELECT stripe_customer_id FROM organization_billing WHERE organization_id = ? LIMIT 1'
  ).bind(member.organizationId).first<{ stripe_customer_id: string | null }>()

  if (!billing?.stripe_customer_id) return jsonResponse({ card: null })

  try {
    const stripe = getStripe(env)
    const customer = await stripe.customers.retrieve(billing.stripe_customer_id, {
      expand: ['invoice_settings.default_payment_method'],
    }) as Stripe.Customer

    const pm = customer.invoice_settings?.default_payment_method
    if (!pm || typeof pm === 'string' || pm.type !== 'card' || !pm.card) {
      return jsonResponse({ card: null })
    }

    return jsonResponse({
      card: {
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
      }
    })
  } catch {
    return jsonResponse({ card: null })
  }
})
