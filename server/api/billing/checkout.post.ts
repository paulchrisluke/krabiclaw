import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, getPriceIdForPlan, requireBillingAccess } from '../../utils/billing'
import { execute, queryFirst } from '~/server/db'

interface CheckoutRequest {
  organizationId?: string
  siteId?: string
  plan: string
  interval?: 'month' | 'year'
  successUrl?: string
  cancelUrl?: string
  gaClientId?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as CheckoutRequest
  const { plan, successUrl, cancelUrl } = body
  const interval = body.interval ?? 'month'

  if (!plan) return jsonResponse({ error: 'Plan is required' }, { status: 400 })

  const ALLOWED_PLANS = ['growth', 'managed', 'seo_accelerator']
  if (!ALLOWED_PLANS.includes(plan)) {
    return jsonResponse({ error: `Invalid plan. Allowed values are ${ALLOWED_PLANS.join(', ')}` }, { status: 400 })
  }
  if (interval !== 'month' && interval !== 'year') {
    return jsonResponse({ error: 'Invalid interval. Allowed values are month or year' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  if (!env.STRIPE_SECRET_KEY) return jsonResponse({ error: 'Stripe not configured' }, { status: 503 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  // Resolve org — either passed explicitly or detected from session
  let organizationId = body.organizationId
  if (!organizationId) {
    const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string }
    const activeOrgId = typeof sessionRecord.activeOrganizationId === 'string' ? sessionRecord.activeOrganizationId : ''
    const userOrg = await queryFirst<{ organizationId: string }>(db, `
      SELECT o.id AS organizationId FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, o.createdAt ASC LIMIT 1
    `, [session.user.id, activeOrgId])
    if (!userOrg) return jsonResponse({ error: 'No organization found' }, { status: 404 })
    organizationId = userOrg.organizationId
  }
  const orgId = organizationId!

  // Resolve site — must be passed explicitly for multi-site orgs
  const siteId = body.siteId
  if (!siteId) return jsonResponse({ error: 'siteId is required' }, { status: 400 })

  const site = await queryFirst<{ id: string }>(db, `SELECT id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1`, [siteId, orgId])
  if (!site) return jsonResponse({ error: 'Site not found or does not belong to this organization' }, { status: 404 })
  const resolvedSiteId = siteId

  try {
    await requireBillingAccess(env, db, orgId, session.user.id)

    const organization = await queryFirst<{ name: string; slug: string | null; stripe_customer_id: string | null }>(db, `
      SELECT o.name, o.slug, ob.stripe_customer_id
      FROM organization o
      LEFT JOIN organization_billing ob ON o.id = ob.organization_id
      WHERE o.id = ? LIMIT 1
    `, [orgId])
    if (!organization) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

    let priceId: string
    try {
      priceId = await getPriceIdForPlan(env, plan, interval)
    } catch (error) {
      console.error('Invalid Stripe pricing configuration', { plan, interval, error })
      return jsonResponse({ error: 'Billing is temporarily unavailable for the selected plan' }, { status: 503 })
    }

    const stripe = getStripe(env)

    // Ensure Stripe customer exists at org level (shared payment method across sites).
    // The stored ID can go stale (deleted in Stripe, or a synthetic ID from a test
    // webhook) — validate before reuse rather than passing a dead ID to Checkout.
    let customerId = organization.stripe_customer_id
    if (customerId) {
      try {
        const existingCustomer = await stripe.customers.retrieve(customerId)
        if ('deleted' in existingCustomer && existingCustomer.deleted) customerId = null
      } catch (error) {
        console.warn('checkout_customer_lookup_failed', { organizationId: orgId, customerId, error })
        customerId = null
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: organization.name,
        metadata: { organization_id: orgId },
      })
      customerId = customer.id
      await execute(db, `
        INSERT OR REPLACE INTO organization_billing (id, organization_id, stripe_customer_id, updated_at)
        VALUES (?, ?, ?, ?)
      `, [`billing-${orgId}`, orgId, customerId, new Date().toISOString()])
    }

    const targetSlug = organization.slug ? encodeURIComponent(organization.slug) : encodeURIComponent(orgId)
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || `${getRequestURL(event).origin}/dashboard/${targetSlug}/~/settings/billing?success=true`,
      cancel_url: cancelUrl || `${getRequestURL(event).origin}/dashboard/${targetSlug}/~/settings/billing?canceled=true`,
      metadata: {
        organization_id: orgId,
        site_id: resolvedSiteId,
        plan,
        ...(body.gaClientId ? { ga_client_id: body.gaClientId } : {}),
      },
      subscription_data: {
        metadata: {
          organization_id: orgId,
          site_id: resolvedSiteId,
          plan,
          ...(body.gaClientId ? { ga_client_id: body.gaClientId } : {}),
        },
      },
    })

    return jsonResponse({ success: true, checkoutUrl: checkoutSession.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to create checkout session:', message)
    if (message.startsWith('Access denied')) return jsonResponse({ error: message }, { status: 403 })
    return jsonResponse({ error: 'Failed to create checkout session' }, { status: 500 })
  }
})
