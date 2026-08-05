// POST /api/billing/service-addon
// Creates a Stripe Checkout Session for one-time managed service add-ons.
// Paul & Julia fulfill these manually — the webhook logs the purchase row.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, requireBillingAccess } from '~/server/utils/billing'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { queryFirst } from '~/server/db'

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

  const organization = await resolveRequestedOrganization(event, db, session.user.id, {
    explicitOrganizationId: body.organizationId ?? null,
  })
  if (!organization) return jsonResponse({ error: 'No organization found' }, { status: 404 })

  const orgId = organization.id
  const orgSlug = organization.slug

  await requireBillingAccess(env, db, orgId, session.user.id)

  const billing = await queryFirst<{ stripe_customer_id: string | null }>(
    db, 'SELECT stripe_customer_id FROM organization_billing WHERE organization_id = ? LIMIT 1', [orgId],
  )

  const stripe = getStripe(env)
  const origin = getRequestURL(event).origin
  const encodedOrgSlug = encodeURIComponent(orgSlug)

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: billing?.stripe_customer_id || undefined,
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    payment_intent_data: { setup_future_usage: 'off_session' },
    success_url: `${origin}/dashboard/${encodedOrgSlug}/settings/billing?addon_success=${addonType}`,
    cancel_url: `${origin}/dashboard/${encodedOrgSlug}/settings/billing`,
    metadata: {
      organization_id: orgId,
      type: 'service_addon',
      addon_type: addonType,
    },
  })

  return jsonResponse({ checkoutUrl: checkoutSession.url })
})
