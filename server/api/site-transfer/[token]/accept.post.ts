// POST /api/site-transfer/[token]/accept — authenticated: accept and execute a site transfer
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { executeSiteTransfer } from '~/server/utils/site-transfer'
import { getStripe, getPriceIdForPlan } from '~/server/utils/billing'
import type Stripe from 'stripe'

function checkoutSessionIsReusable(
  session: Stripe.Checkout.Session,
  transferId: string,
): session is Stripe.Checkout.Session & { url: string } {
  return session.status === 'open'
    && typeof session.url === 'string'
    && session.url.length > 0
    && session.metadata?.transfer_request_id === transferId
}

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
      `SELECT id, site_id, from_organization_id, to_email, status,
              invited_plan, invited_coupon, requires_payment, stripe_checkout_session_id
       FROM site_transfer_requests WHERE token = ? LIMIT 1`,
    )
    .bind(token)
    .first<{
      id: string
      site_id: string
      from_organization_id: string
      to_email: string
      status: string
      invited_plan: string | null
      invited_coupon: string | null
      requires_payment: number
      stripe_checkout_session_id: string | null
    }>()

  if (!transfer) return jsonResponse({ error: 'Transfer not found' }, { status: 404 })

  if (transfer.status !== 'pending') {
    return jsonResponse(
      { error: `Transfer is already ${transfer.status}` },
      { status: 410 },
    )
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

  const requiresPayment = transfer.requires_payment === 1 || Boolean(transfer.invited_plan)

  if (requiresPayment) {
    if (!transfer.invited_plan) {
      return jsonResponse({ error: 'This handoff is missing its required plan.' }, { status: 500 })
    }
    if (!env.STRIPE_SECRET_KEY) {
      return jsonResponse({ error: 'Stripe secret key not configured' }, { status: 503 })
    }

    try {
      const priceId = await getPriceIdForPlan(env, transfer.invited_plan, 'month')
      const stripe = getStripe(env)

      // Get or create Stripe customer for the new org
      const orgRow = await db
        .prepare(`SELECT o.name, o.slug, b.stripe_customer_id FROM organization o LEFT JOIN organization_billing b ON o.id = b.organization_id WHERE o.id = ? LIMIT 1`)
        .bind(toOrgId)
        .first<{ name: string; slug: string | null; stripe_customer_id: string | null }>()

      let customerId = orgRow?.stripe_customer_id ?? null
      if (customerId) {
        try {
          const existingCustomer = await stripe.customers.retrieve(customerId)
          if ('deleted' in existingCustomer && existingCustomer.deleted) {
            customerId = null
          }
        } catch (error) {
          console.warn('transfer_checkout_customer_lookup_failed', {
            organizationId: toOrgId,
            customerId,
            error,
          })
          customerId = null
        }
      }

      if (!customerId) {
        if (!userEmail) throw new Error('User email required to create Stripe customer')
        const customer = await stripe.customers.create({
          email: userEmail,
          name: orgRow?.name ?? userEmail,
          metadata: { organization_id: toOrgId },
        })
        customerId = customer.id
        const billingId = `billing-${toOrgId}`
        const billingExists = await db
          .prepare(`SELECT id FROM organization_billing WHERE organization_id = ? LIMIT 1`)
          .bind(toOrgId)
          .first<{ id: string }>()

        if (billingExists?.id) {
          await db
            .prepare(`UPDATE organization_billing SET stripe_customer_id = ?, updated_at = ? WHERE id = ?`)
            .bind(customerId, new Date().toISOString(), billingExists.id)
            .run()
        } else {
          await db
            .prepare(`INSERT INTO organization_billing (id, organization_id, stripe_customer_id, updated_at) VALUES (?, ?, ?, ?)`)
            .bind(billingId, toOrgId, customerId, new Date().toISOString())
            .run()
        }
      }

      const origin = getRequestURL(event).origin
      const slug = orgRow?.slug ? encodeURIComponent(orgRow.slug) : encodeURIComponent(toOrgId)

      if (transfer.stripe_checkout_session_id) {
        try {
          const existingSession = await stripe.checkout.sessions.retrieve(transfer.stripe_checkout_session_id)
          if (checkoutSessionIsReusable(existingSession, transfer.id)) {
            await db.prepare(`
              UPDATE site_transfer_requests
              SET claiming_user_id = ?, claiming_organization_id = ?
              WHERE id = ?
            `).bind(userId, toOrgId, transfer.id).run()

            return jsonResponse({ success: true, site_id: transfer.site_id, checkout_url: existingSession.url })
          }
        } catch (error) {
          console.warn('transfer_checkout_session_reuse_failed', {
            transferId: transfer.id,
            checkoutSessionId: transfer.stripe_checkout_session_id,
            error,
          })
        }
      }

      const checkoutParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/dashboard/${slug}/~/onboarding?new=true`,
        cancel_url: `${origin}/dashboard/${slug}/~/onboarding?new=true&payment=cancelled`,
        metadata: {
          type: 'site_transfer',
          organization_id: toOrgId,
          plan: transfer.invited_plan,
          transfer_request_id: transfer.id,
          transfer_site_id: transfer.site_id,
          transfer_claiming_user_id: userId,
          transfer_claiming_organization_id: toOrgId,
        },
        subscription_data: {
          metadata: {
            organization_id: toOrgId,
            plan: transfer.invited_plan,
            transfer_request_id: transfer.id,
          },
        },
      }

      if (transfer.invited_coupon) {
        checkoutParams.discounts = [{ coupon: transfer.invited_coupon }]
      }

      const checkoutSession = await stripe.checkout.sessions.create(checkoutParams)
      const persistResult = await db.prepare(`
        UPDATE site_transfer_requests
        SET claiming_user_id = ?, claiming_organization_id = ?, stripe_checkout_session_id = ?
        WHERE id = ?
          AND (stripe_checkout_session_id IS NULL OR stripe_checkout_session_id = ?)
      `).bind(userId, toOrgId, checkoutSession.id, transfer.id, transfer.stripe_checkout_session_id).run()

      if ((persistResult.meta?.changes ?? 0) === 0) {
        const latestTransfer = await db
          .prepare(`SELECT stripe_checkout_session_id FROM site_transfer_requests WHERE id = ? LIMIT 1`)
          .bind(transfer.id)
          .first<{ stripe_checkout_session_id: string | null }>()

        if (latestTransfer?.stripe_checkout_session_id) {
          const latestSession = await stripe.checkout.sessions.retrieve(latestTransfer.stripe_checkout_session_id)
          if (checkoutSessionIsReusable(latestSession, transfer.id)) {
            return jsonResponse({ success: true, site_id: transfer.site_id, checkout_url: latestSession.url })
          }
        }

        throw new Error('Failed to persist or reuse checkout session for this handoff.')
      }

      return jsonResponse({ success: true, site_id: transfer.site_id, checkout_url: checkoutSession.url })
    } catch (err) {
      console.error('transfer_checkout_failed', err)
      return jsonResponse({ error: 'Failed to start checkout for this handoff.' }, { status: 500 })
    }
  }

  await executeSiteTransfer(
    db,
    transfer.site_id,
    transfer.from_organization_id,
    toOrgId,
    transfer.id,
    userId,
  )

  return jsonResponse({ success: true, site_id: transfer.site_id })
})
