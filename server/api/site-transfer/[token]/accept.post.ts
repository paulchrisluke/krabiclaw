// POST /api/site-transfer/[token]/accept — authenticated: accept and execute a site transfer
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { executeSiteTransfer } from '~/server/utils/site-transfer'
import { getStripe, getPriceIdForPlan } from '~/server/utils/billing'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const userId = session.user.id
  const userEmail = session.user.email?.toLowerCase() ?? ''
  const isPlatAdmin = isPlatformOwner(session.user.email, env)

  const transfer = await db
    .prepare(
      `SELECT id, site_id, from_organization_id, to_email, status, expires_at, invited_plan, invited_coupon
       FROM site_transfer_requests WHERE token = ? LIMIT 1`,
    )
    .bind(token)
    .first<{
      id: string
      site_id: string
      from_organization_id: string
      to_email: string
      status: string
      expires_at: string
      invited_plan: string | null
      invited_coupon: string | null
    }>()

  if (!transfer) return jsonResponse({ error: 'Transfer not found' }, { status: 404 })

  if (transfer.status !== 'pending') {
    return jsonResponse(
      { error: `Transfer is already ${transfer.status}` },
      { status: 410 },
    )
  }

  if (new Date(transfer.expires_at) < new Date()) {
    await db
      .prepare(`UPDATE site_transfer_requests SET status = 'expired' WHERE id = ?`)
      .bind(transfer.id)
      .run()
    return jsonResponse({ error: 'Transfer has expired' }, { status: 410 })
  }

  // Only the intended recipient or a platform admin may accept
  if (!isPlatAdmin && userEmail !== transfer.to_email.toLowerCase()) {
    return jsonResponse(
      { error: `This transfer was sent to ${transfer.to_email}. Please sign in with that account.` },
      { status: 403 },
    )
  }

  // Find the accepting user's owner org (created automatically on signup)
  const ownerMember = await db
    .prepare(
      `SELECT organizationId FROM member WHERE userId = ? AND role = 'owner' LIMIT 1`,
    )
    .bind(userId)
    .first<{ organizationId: string }>()

  if (!ownerMember) {
    return jsonResponse(
      { error: 'Your account does not have an owner organization. Please contact support.' },
      { status: 422 },
    )
  }

  const toOrgId = ownerMember.organizationId

  if (toOrgId === transfer.from_organization_id) {
    return jsonResponse({ error: 'You already own this site' }, { status: 422 })
  }

  await executeSiteTransfer(
    db,
    transfer.site_id,
    transfer.from_organization_id,
    toOrgId,
    transfer.id,
    userId,
  )

  // If a plan was attached, create a Stripe Checkout session for the new owner's org
  if (transfer.invited_plan && env.STRIPE_SECRET_KEY) {
    try {
      const priceId = await getPriceIdForPlan(env, transfer.invited_plan, 'month')
      const stripe = getStripe(env)

      // Get or create Stripe customer for the new org
      const orgRow = await db
        .prepare(`SELECT o.name, o.slug, b.stripe_customer_id FROM organization o LEFT JOIN organization_billing b ON o.id = b.organization_id WHERE o.id = ? LIMIT 1`)
        .bind(toOrgId)
        .first<{ name: string; slug: string | null; stripe_customer_id: string | null }>()

      let customerId = orgRow?.stripe_customer_id ?? null
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          name: orgRow?.name ?? userEmail,
          metadata: { organization_id: toOrgId },
        })
        customerId = customer.id
        await db
          .prepare(`INSERT OR REPLACE INTO organization_billing (id, organization_id, stripe_customer_id, updated_at) VALUES (?, ?, ?, ?)`)
          .bind(`billing-${toOrgId}`, toOrgId, customerId, new Date().toISOString())
          .run()
      }

      const origin = getRequestURL(event).origin
      const slug = orgRow?.slug ? encodeURIComponent(orgRow.slug) : encodeURIComponent(toOrgId)

      const checkoutParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/dashboard/${slug}/~/settings/billing?success=true`,
        cancel_url: `${origin}/dashboard/${slug}/~/settings/billing`,
        metadata: { organization_id: toOrgId, plan: transfer.invited_plan },
        subscription_data: { metadata: { organization_id: toOrgId, plan: transfer.invited_plan } },
      }

      if (transfer.invited_coupon) {
        checkoutParams.discounts = [{ coupon: transfer.invited_coupon }]
      }

      const checkoutSession = await stripe.checkout.sessions.create(checkoutParams)

      return jsonResponse({ success: true, site_id: transfer.site_id, checkout_url: checkoutSession.url })
    } catch (err) {
      // Transfer already completed — don't fail, just skip the checkout
      console.error('transfer_checkout_failed', err)
    }
  }

  return jsonResponse({ success: true, site_id: transfer.site_id })
})
