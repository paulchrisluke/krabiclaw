// POST /api/billing/service-addon
// Creates a Stripe Checkout Session for one-time managed service add-ons.
// Paul & Julia fulfill these manually — the webhook logs the purchase row.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, requireBillingAccess } from '~/server/utils/billing'

type AddonType = 'translation' | 'seasonal' | 'gbp_setup'

const ADDON_PRICE_ENV: Record<AddonType, string> = {
  translation: 'STRIPE_PRICE_TRANSLATION',
  seasonal: 'STRIPE_PRICE_SEASONAL',
  gbp_setup: 'STRIPE_PRICE_GBP_SETUP',
}

const ADDON_NAMES: Record<AddonType, string> = {
  translation: 'Additional Language Translation',
  seasonal: 'Seasonal Relaunch Package',
  gbp_setup: 'Google Business Optimization',
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  if (!env.STRIPE_SECRET_KEY) return jsonResponse({ error: 'Stripe not configured' }, { status: 503 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({})) as { addonType?: string; organizationId?: string }
  const addonType = body.addonType as AddonType | undefined

  if (!addonType || !ADDON_PRICE_ENV[addonType]) {
    return jsonResponse({
      error: `Invalid addonType. Allowed values: ${Object.keys(ADDON_PRICE_ENV).join(', ')}`
    }, { status: 400 })
  }

  const priceEnvKey = ADDON_PRICE_ENV[addonType]
  const priceId = env[priceEnvKey] as string | undefined
  if (!priceId) {
    return jsonResponse({
      error: `${ADDON_NAMES[addonType]} is not yet configured. Contact us on WhatsApp to arrange.`
    }, { status: 503 })
  }

  // Resolve org from session
  const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string }
  const activeOrgId = typeof sessionRecord.activeOrganizationId === 'string'
    ? sessionRecord.activeOrganizationId : ''

  const userOrg = await db.prepare(`
    SELECT o.id AS organizationId, o.slug
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
    ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, o.createdAt ASC
    LIMIT 1
  `).bind(session.user.id, activeOrgId).first<{ organizationId: string; slug: string | null }>()

  if (!userOrg) return jsonResponse({ error: 'No organization found' }, { status: 404 })

  const orgId = userOrg.organizationId
  const orgSlug = userOrg.slug

  await requireBillingAccess(env, db, orgId, session.user.id)

  const billing = await db.prepare(
    'SELECT stripe_customer_id FROM organization_billing WHERE organization_id = ? LIMIT 1'
  ).bind(orgId).first<{ stripe_customer_id: string | null }>()

  const stripe = getStripe(env)
  const origin = getRequestURL(event).origin

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: billing?.stripe_customer_id || undefined,
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    payment_intent_data: { setup_future_usage: 'off_session' },
    success_url: `${origin}/dashboard/${orgSlug}/~/settings/billing?addon_success=${addonType}`,
    cancel_url: `${origin}/dashboard/${orgSlug}/~/settings/billing`,
    metadata: {
      organization_id: orgId,
      type: 'service_addon',
      addon_type: addonType,
    },
  })

  return jsonResponse({ checkoutUrl: checkoutSession.url })
})
