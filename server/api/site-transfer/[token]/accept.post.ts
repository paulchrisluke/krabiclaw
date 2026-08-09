// POST /api/site-transfer/[token]/accept — authenticated: accept and execute a site transfer
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'
import {
  completePaidSiteTransfer,
  executeSiteTransfer,
  isTransferCheckoutPending,
  isTransferClaimSentinel,
  newTransferClaimSentinel,
} from '~/server/utils/site-transfer'
import { createOrganizationForSite, findOldestOwnedOrganization } from '~/server/utils/site-creation'
import { getStripe, getPriceIdForPlan } from '~/server/utils/billing'
import { getOrganizationBillingProjection } from '~/server/utils/organization-billing'
import { assertNewSalePlan, type NewSalePlanId } from '~/shared/billing-model'
import { getOrgAdapter } from 'better-auth/plugins'
import type Stripe from 'stripe'

type OrganizationAdapter = ReturnType<typeof getOrgAdapter>

interface CheckoutSessionExpectation {
  transferId: string
  siteId: string
  customerId: string
  organizationId: string
  userId: string
  plan: NewSalePlanId
  priceId: string
}

function stripeCustomerId(customer: Stripe.Checkout.Session['customer']): string | null {
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id
}

function assertOrganizationStripeCustomer(customer: Stripe.Customer, organizationId: string): void {
  const metadata = customer.metadata ?? {}
  const camelOrganizationId = metadata.organizationId?.trim() || null
  const snakeOrganizationId = metadata.organization_id?.trim() || null
  const customerType = metadata.customerType?.trim() || null
  if (
    (!camelOrganizationId && !snakeOrganizationId)
    || (camelOrganizationId && camelOrganizationId !== organizationId)
    || (snakeOrganizationId && snakeOrganizationId !== organizationId)
    || (camelOrganizationId && snakeOrganizationId && camelOrganizationId !== snakeOrganizationId)
    || (customerType && customerType !== 'organization')
  ) {
    throw new Error(`Stripe customer ${customer.id} is not owned by organization ${organizationId}`)
  }
}

function checkoutSessionIsReusable(
  session: Stripe.Checkout.Session,
  expected: CheckoutSessionExpectation,
): session is Stripe.Checkout.Session & { url: string } {
  if (
    session.status !== 'open'
    || typeof session.url !== 'string'
    || session.url.length === 0
    || session.mode !== 'subscription'
    || stripeCustomerId(session.customer) !== expected.customerId
    || session.client_reference_id !== expected.organizationId
  ) return false

  const metadata = session.metadata ?? {}
  const expectedMetadata: Record<string, string> = {
    type: 'site_transfer',
    referenceId: expected.organizationId,
    organization_id: expected.organizationId,
    plan: expected.plan,
    transfer_request_id: expected.transferId,
    transfer_site_id: expected.siteId,
    transfer_claiming_user_id: expected.userId,
    transfer_claiming_organization_id: expected.organizationId,
  }
  const expectedMetadataEntries = Object.entries(expectedMetadata)
  if (
    Object.keys(metadata).length !== expectedMetadataEntries.length
    || expectedMetadataEntries.some(([key, value]) => metadata[key] !== value)
  ) return false

  const lineItems = session.line_items?.data ?? []
  if (session.line_items?.has_more || lineItems.length !== 1) return false
  const lineItem = lineItems[0]
  const linePriceId = typeof lineItem?.price === 'string' ? lineItem.price : lineItem?.price?.id
  return linePriceId === expected.priceId && lineItem?.quantity === 1
}

function isStripeResourceMissing(error: unknown): boolean {
  const candidate = error as { code?: unknown; statusCode?: unknown; type?: unknown } | null
  return candidate?.code === 'resource_missing'
    || (candidate?.statusCode === 404 && candidate?.type === 'StripeInvalidRequestError')
}

async function expireCheckoutSessionExactly(
  stripe: ReturnType<typeof getStripe>,
  checkoutSessionId: string,
): Promise<void> {
  let expireError: unknown = null
  try {
    const expired = await stripe.checkout.sessions.expire(checkoutSessionId)
    if (expired.status === 'expired') return
  } catch (error) {
    expireError = error
  }

  try {
    const latest = await stripe.checkout.sessions.retrieve(checkoutSessionId)
    if (latest.status === 'expired') return
    throw new Error(`Stripe Checkout ${checkoutSessionId} remains ${String(latest.status)} after expiration`)
  } catch (error) {
    if (isStripeResourceMissing(error)) return
    if (expireError) throw expireError
    throw error
  }
}

function transferCheckoutIdempotencyKey(transferId: string, previousSessionId: string | null): string {
  return previousSessionId
    ? `krabiclaw:site-transfer-checkout:${transferId}:replacement:${previousSessionId}`
    : `krabiclaw:site-transfer-checkout:${transferId}`
}

function transferCustomerIdempotencyKey(organizationId: string, staleCustomerId: string | null = null): string {
  return staleCustomerId
    ? `krabiclaw:organization-customer:${organizationId}:replacement:${staleCustomerId}`
    : `krabiclaw:organization-customer:${organizationId}`
}

function hasActiveOrganizationSubscription(projection: Awaited<ReturnType<typeof getOrganizationBillingProjection>>): boolean {
  const plan = projection.plan.trim().toLowerCase()
  const status = projection.status.trim().toLowerCase()
  return Boolean(projection.stripeSubscriptionId)
    && plan === 'growth'
    && ['active', 'trialing', 'past_due', 'processing', 'pending'].includes(status)
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
  let organizationAdapterPromise: Promise<OrganizationAdapter> | null = null
  const organizationAdapter = () => {
    if (!organizationAdapterPromise) {
      organizationAdapterPromise = (async () => {
        const auth = createAuth(env)
        const authContext = await auth.$context
        return getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
      })()
    }
    return organizationAdapterPromise
  }
  const isCurrentOrganizationOwner = async (organizationId: string | null): Promise<boolean> => {
    if (!organizationId) return false
    const adapter = await organizationAdapter()
    const member = await adapter.findMemberByOrgId({ userId, organizationId })
    return member?.userId === userId
      && member.organizationId === organizationId
      && member.role === 'owner'
  }

  let acceptBody: { interval?: string } = {}
  try {
    acceptBody = (await readBody(event)) ?? {}
  } catch { /* empty body is fine */ }

  const transfer = await queryFirst<{
    id: string
    site_id: string
    from_organization_id: string
    to_email: string
    status: string
    invited_plan: string | null
    invited_coupon: string | null
    invited_interval: string | null
    requires_payment: number
    stripe_checkout_session_id: string | null
    claiming_user_id: string | null
    claiming_organization_id: string | null
    payment_completed_at: string | null
  }>(
    db,
    `SELECT id, site_id, from_organization_id, to_email, status,
            invited_plan, invited_coupon, invited_interval, requires_payment, stripe_checkout_session_id,
            claiming_user_id, claiming_organization_id, payment_completed_at
     FROM site_transfer_requests WHERE token = ? LIMIT 1`,
    [token],
  )

  if (!transfer) return jsonResponse({ error: 'Transfer not found' }, { status: 404 })

  const checkoutPending = isTransferCheckoutPending(transfer)
  const claiming = isTransferClaimSentinel(transfer.stripe_checkout_session_id)

  // A pending claim sentinel is owned by the acceptance request that wrote
  // it. Never resume or perform provider work from a second request; the
  // original request will either release the sentinel or persist Checkout.
  if (transfer.status === 'pending' && claiming) {
    return jsonResponse({
      error: 'This handoff is already being accepted. Retry after the current attempt finishes.',
    }, { status: 409 })
  }

  // A real stored Checkout is reusable only by its exact claimant/org. A
  // legacy pending row with an unowned real session is unsafe to continue and
  // must be reissued by an operator rather than risking a duplicate charge.
  if (transfer.status === 'pending' && transfer.stripe_checkout_session_id && !checkoutPending) {
    return jsonResponse({
      error: 'This handoff has an unowned Checkout session. Ask an operator to reissue it.',
    }, { status: 409 })
  }

  if (transfer.status !== 'pending') {
    // An entitled handoff claims the site before the legacy custom-domain
    // restoration saga runs. Only that same claimant may retry the
    // accepted/payment-pending completion. Platform control-plane permission
    // is not tenant ownership; operators use the separately authorized exact
    // recipient force-accept route.
    if (
      transfer.status === 'accepted'
      && (transfer.requires_payment === 1 || Boolean(transfer.invited_plan))
      && !transfer.payment_completed_at
      && transfer.claiming_user_id === userId
    ) {
      if (!await isCurrentOrganizationOwner(transfer.claiming_organization_id)) {
        return jsonResponse({ error: 'You no longer own the organization reserved for this handoff.' }, { status: 409 })
      }
      try {
        await completePaidSiteTransfer(env, db, transfer.id)
      } catch (error) {
        console.error('accepted_site_transfer_completion_retry_failed', {
          transferId: transfer.id,
          siteId: transfer.site_id,
          error,
        })
        return jsonResponse({ error: 'Failed to complete this site handoff. Please retry.' }, { status: 500 })
      }
      return jsonResponse({ success: true, site_id: transfer.site_id })
    }
    return jsonResponse(
      { error: `Transfer is already ${transfer.status}` },
      { status: 410 },
    )
  }

  // Only the intended Better Auth account may accept. Platform control-plane
  // access must not become implicit tenant ownership.
  if (userEmail !== transfer.to_email.toLowerCase()) {
    return jsonResponse(
      { error: `This transfer was sent to ${transfer.to_email}. Please sign in with that account.` },
      { status: 403 },
    )
  }

  const hasInvitedPlan = transfer.invited_plan !== null
  const requiresPayment = transfer.requires_payment === 1 || hasInvitedPlan
  let validatedPlan: NewSalePlanId | null = null

  if (requiresPayment) {
    if (!hasInvitedPlan || !transfer.invited_plan) {
      return jsonResponse({
        error: 'This handoff is missing a supported billing plan. Ask the sender to reissue it with Growth.',
      }, { status: 409 })
    }
    try {
      validatedPlan = assertNewSalePlan(transfer.invited_plan)
    } catch {
      return jsonResponse({
        error: 'This handoff uses an unsupported billing plan. Ask the sender to reissue it with Growth.',
      }, { status: 409 })
    }
  }

  // Read-only org discovery is safe before claiming. Creating a new Better
  // Auth organization is deferred until after the pending-state CAS below.
  const existingOwnerOrganizationId = await findOldestOwnedOrganization(env, userId)
  let toOrgId = checkoutPending
    ? transfer.claiming_organization_id
    : existingOwnerOrganizationId
  if (checkoutPending && (!toOrgId || transfer.claiming_user_id !== userId)) {
    return jsonResponse({
      error: 'This handoff is reserved for another recipient. Retry from the invited account.',
    }, { status: 409 })
  }
  if (toOrgId && !await isCurrentOrganizationOwner(toOrgId)) {
    return jsonResponse({ error: 'You no longer own the organization reserved for this handoff.' }, { status: 409 })
  }

  const claimSentinel = newTransferClaimSentinel()
  if (!checkoutPending) {
    const claim = await execute(db, `
      UPDATE site_transfer_requests
      SET claiming_user_id = ?, claiming_organization_id = ?, stripe_checkout_session_id = ?
      WHERE id = ? AND status = 'pending' AND stripe_checkout_session_id IS NULL
    `, [userId, toOrgId, claimSentinel, transfer.id])
    if ((claim.meta?.changes ?? 0) !== 1) {
      return jsonResponse({
        error: 'This handoff is already being accepted. Retry after the current attempt finishes.',
      }, { status: 409 })
    }
  }

  // A brand-new recipient legitimately has no organization yet. Create it
  // only after the transfer sentinel is durable, then bind the exact org to
  // that sentinel before any Stripe/customer work.
  if (!toOrgId) {
    try {
      toOrgId = (await createOrganizationForSite(
        env,
        userId,
        session.user.name || session.user.email || 'My Business',
      )).organizationId
      const orgClaim = await execute(db, `
        UPDATE site_transfer_requests
        SET claiming_organization_id = ?
        WHERE id = ? AND status = 'pending'
          AND stripe_checkout_session_id = ?
          AND claiming_user_id = ?
          AND claiming_organization_id IS NULL
      `, [toOrgId, transfer.id, claimSentinel, userId])
      if ((orgClaim.meta?.changes ?? 0) !== 1) {
        return jsonResponse({ error: 'This handoff was cancelled while creating the recipient organization.' }, { status: 409 })
      }
      if (!await isCurrentOrganizationOwner(toOrgId)) {
        await execute(db, `
          UPDATE site_transfer_requests
          SET claiming_user_id = NULL, claiming_organization_id = NULL, stripe_checkout_session_id = NULL
          WHERE id = ? AND status = 'pending' AND stripe_checkout_session_id = ?
        `, [transfer.id, claimSentinel])
        return jsonResponse({ error: 'The recipient organization owner could not be verified.' }, { status: 409 })
      }
    } catch (error) {
      try {
        await execute(db, `
          UPDATE site_transfer_requests
          SET claiming_user_id = NULL, claiming_organization_id = NULL, stripe_checkout_session_id = NULL
          WHERE id = ? AND status = 'pending' AND stripe_checkout_session_id = ?
        `, [transfer.id, claimSentinel])
      } catch (cleanupError) {
        console.error('transfer_recipient_organization_claim_cleanup_failed', {
          transferId: transfer.id,
          cleanupError,
        })
      }
      console.error('transfer_recipient_organization_create_failed', {
        transferId: transfer.id,
        error,
      })
      return jsonResponse({ error: 'Failed to prepare the recipient organization. Please retry.' }, { status: 500 })
    }
  }

  if (!toOrgId) throw new Error('Recipient organization is unavailable')
  if (toOrgId === transfer.from_organization_id) {
    await execute(db, `
      UPDATE site_transfer_requests
      SET claiming_user_id = NULL, claiming_organization_id = NULL, stripe_checkout_session_id = NULL
      WHERE id = ? AND status = 'pending' AND stripe_checkout_session_id = ?
    `, [transfer.id, claimSentinel])
    return jsonResponse({ error: 'You already own this site' }, { status: 422 })
  }

  // The owner of a checkout-pending row is exact and must not be replaced by
  // a different active organization discovered from the session.
  if (checkoutPending && toOrgId !== transfer.claiming_organization_id) {
    return jsonResponse({ error: 'This handoff is reserved for another organization.' }, { status: 409 })
  }

  let activeClaimSessionId = checkoutPending
    ? transfer.stripe_checkout_session_id
    : claimSentinel
  if (!activeClaimSessionId) throw new Error('Transfer claim session is unavailable')
  let releaseOnFailure = !checkoutPending
  const releaseClaim = async () => {
    if (!releaseOnFailure) return
    await execute(db, `
      UPDATE site_transfer_requests
      SET claiming_user_id = NULL, claiming_organization_id = NULL, stripe_checkout_session_id = NULL
      WHERE id = ? AND status = 'pending'
        AND stripe_checkout_session_id = ?
        AND claiming_user_id = ?
        AND claiming_organization_id = ?
    `, [transfer.id, activeClaimSessionId, userId, toOrgId]).catch(error => {
      console.error('transfer_claim_release_failed', { transferId: transfer.id, error })
    })
  }
  const assertClaimHeld = async () => {
    const current = await queryFirst<{
      status: string
      stripe_checkout_session_id: string | null
      claiming_user_id: string | null
      claiming_organization_id: string | null
    }>(db, `
      SELECT status, stripe_checkout_session_id, claiming_user_id, claiming_organization_id
      FROM site_transfer_requests
      WHERE id = ? LIMIT 1
    `, [transfer.id])
    return current?.status === 'pending'
      && current.stripe_checkout_session_id === activeClaimSessionId
      && current.claiming_user_id === userId
      && current.claiming_organization_id === toOrgId
  }

  if (requiresPayment) {
    if (!validatedPlan) {
      return jsonResponse({
        error: 'This handoff is missing a supported billing plan. Ask the sender to reissue it with Growth.',
      }, { status: 409 })
    }

    // Billing is organization-scoped. An entitled recipient already has the
    // one subscription this handoff needs; attach the site to that authority
    // instead of creating a second Stripe subscription.
    let recipientBilling: Awaited<ReturnType<typeof getOrganizationBillingProjection>>
    try {
      recipientBilling = await getOrganizationBillingProjection(db, toOrgId)
    } catch (error) {
      console.error('transfer_recipient_billing_projection_failed', {
        transferId: transfer.id,
        organizationId: toOrgId,
        error,
      })
      await releaseClaim()
      return jsonResponse({ error: 'Recipient billing state is unavailable. Please retry.' }, { status: 503 })
    }
    if (hasActiveOrganizationSubscription(recipientBilling)) {
      if (recipientBilling.effectivePlan !== 'growth') {
        await releaseClaim()
        return jsonResponse({
          error: 'Your existing subscription needs attention before this handoff can be completed.',
        }, { status: 409 })
      }
      try {
        if (!await assertClaimHeld()) {
          return jsonResponse({ error: 'This handoff was cancelled while it was being accepted.' }, { status: 409 })
        }
        // Keep the transfer accepted but payment-pending until any historical
        // paused-domain snapshot has been restored. If the external saga
        // fails, the same claimant can retry through the accepted branch.
        await executeSiteTransfer(
          db,
          transfer.site_id,
          transfer.from_organization_id,
          toOrgId,
          transfer.id,
          userId,
          {
            expectedCheckoutSessionId: activeClaimSessionId,
            expectedClaimingUserId: userId,
            expectedClaimingOrganizationId: toOrgId,
          },
        )
        await completePaidSiteTransfer(env, db, transfer.id)
      } catch (error) {
        console.error('entitled_site_transfer_completion_failed', {
          transferId: transfer.id,
          siteId: transfer.site_id,
          error,
        })
        await releaseClaim()
        return jsonResponse({ error: 'Failed to complete this site handoff. Please retry.' }, { status: 500 })
      }
      return jsonResponse({ success: true, site_id: transfer.site_id })
    }

    if (!env.STRIPE_SECRET_KEY) {
      await releaseClaim()
      return jsonResponse({ error: 'Stripe secret key not configured' }, { status: 503 })
    }

    let createdCheckoutSessionId: string | null = null
    let persistedCheckoutSessionId: string | null = null
    let checkoutCreateStarted = false
    let checkoutCreateResponseReceived = false
    let stripe: ReturnType<typeof getStripe> | null = null
    const previousCheckoutSessionId = checkoutPending ? transfer.stripe_checkout_session_id : null
    try {
      if (!await assertClaimHeld()) {
        return jsonResponse({ error: 'This handoff was cancelled while it was being accepted.' }, { status: 409 })
      }
      const interval: 'month' | 'year' = acceptBody.interval === 'year' ? 'year'
        : acceptBody.interval === 'month' ? 'month'
        : transfer.invited_interval === 'year' ? 'year'
        : 'month'
      const priceId = await getPriceIdForPlan(env, validatedPlan, interval)
      stripe = getStripe(env)

      // Get or create Stripe customer for the new org
      const orgAdapter = await organizationAdapter()
      const organization = await orgAdapter.findOrganizationById(toOrgId)
      const billingRow = await queryFirst<{ stripe_customer_id: string | null }>(
        db,
        `SELECT stripe_customer_id FROM organization_billing WHERE organization_id = ? LIMIT 1`,
        [toOrgId],
      )
      if (!organization) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
      const organizationStripeCustomerId = typeof (organization as unknown as { stripeCustomerId?: unknown }).stripeCustomerId === 'string'
        ? (organization as unknown as { stripeCustomerId: string }).stripeCustomerId.trim()
        : ''
      const projectedStripeCustomerId = typeof billingRow?.stripe_customer_id === 'string'
        ? billingRow.stripe_customer_id.trim()
        : ''
      const orgRow = {
        name: organization.name,
        slug: organization.slug,
        // Better Auth owns the organization Stripe customer. The app-owned
        // projection is retained only as a compatibility fallback for rows
        // created before the organization field was populated.
        stripe_customer_id: organizationStripeCustomerId || projectedStripeCustomerId || null,
      }

      let customerId = orgRow.stripe_customer_id
      let staleCustomerId: string | null = null
      if (customerId) {
        const candidateCustomerId = customerId
        try {
          const existingCustomer = await stripe.customers.retrieve(customerId)
          if ('deleted' in existingCustomer && existingCustomer.deleted) {
            staleCustomerId = candidateCustomerId
            customerId = null
          } else {
            assertOrganizationStripeCustomer(existingCustomer, toOrgId)
          }
        } catch (error) {
          if ((error as { code?: string })?.code !== 'resource_missing') throw error
          staleCustomerId = candidateCustomerId
          customerId = null
        }
      }

      if (!customerId) {
        if (!userEmail) throw new Error('User email required to create Stripe customer')
        const customer = await stripe.customers.create({
          email: userEmail,
          name: orgRow.name,
          metadata: {
            organizationId: toOrgId,
            customerType: 'organization',
            organization_id: toOrgId,
          },
        }, {
          idempotencyKey: transferCustomerIdempotencyKey(toOrgId, staleCustomerId),
        })
        customerId = customer.id
      }

      // Persist the customer through Better Auth's organization adapter. Do
      // not write the Better Auth organization table through app-owned SQL.
      if (organizationStripeCustomerId !== customerId) {
        const updateOrganization = orgAdapter.updateOrganization as unknown as (
          _organizationId: string,
          _data: { stripeCustomerId: string },
        ) => Promise<unknown>
        const updatedOrganization = await updateOrganization(toOrgId, {
          stripeCustomerId: customerId,
        })
        if (!updatedOrganization) throw new Error('Failed to persist Stripe customer on recipient organization')
      }

      if (!await assertClaimHeld()) {
        return jsonResponse({ error: 'This handoff was cancelled while it was being accepted.' }, { status: 409 })
      }

      const origin = getRequestURL(event).origin
      const slug = encodeURIComponent(orgRow.slug)
      const sessionExpectation: CheckoutSessionExpectation = {
        transferId: transfer.id,
        siteId: transfer.site_id,
        customerId,
        organizationId: toOrgId,
        userId,
        plan: validatedPlan,
        priceId,
      }

      if (checkoutPending && transfer.stripe_checkout_session_id) {
        try {
          const existingSession = await stripe.checkout.sessions.retrieve(
            transfer.stripe_checkout_session_id,
            { expand: ['line_items.data.price'] },
          )
          if (checkoutSessionIsReusable(existingSession, sessionExpectation)) {
            if (!await assertClaimHeld()) {
              return jsonResponse({ error: 'This handoff was cancelled while its Checkout was being checked.' }, { status: 409 })
            }
            return jsonResponse({ success: true, site_id: transfer.site_id, checkout_url: existingSession.url })
          }
          // A known-open session whose customer, metadata, or price no longer
          // matches must be made non-payable before replacement. A completed
          // or otherwise ambiguous session remains bound for reconciliation
          // and must not silently create a second charge.
          if (existingSession.status === 'open') {
            await expireCheckoutSessionExactly(stripe, existingSession.id)
          } else if (existingSession.status !== 'expired') {
            throw new Error(`Stored transfer checkout session ${existingSession.id} is not a matching open session`)
          }
          const replacementClaim = newTransferClaimSentinel()
          const replacement = await execute(db, `
            UPDATE site_transfer_requests
            SET stripe_checkout_session_id = ?
            WHERE id = ? AND status = 'pending'
              AND stripe_checkout_session_id = ?
              AND claiming_user_id = ?
              AND claiming_organization_id = ?
          `, [replacementClaim, transfer.id, transfer.stripe_checkout_session_id, userId, toOrgId])
          if ((replacement.meta?.changes ?? 0) !== 1) {
            return jsonResponse({ error: 'This handoff changed while its Checkout was expiring. Retry.' }, { status: 409 })
          }
          activeClaimSessionId = replacementClaim
          releaseOnFailure = true
        } catch (error) {
          if (!isStripeResourceMissing(error)) throw error
          const replacementClaim = newTransferClaimSentinel()
          const replacement = await execute(db, `
            UPDATE site_transfer_requests
            SET stripe_checkout_session_id = ?
            WHERE id = ? AND status = 'pending'
              AND stripe_checkout_session_id = ?
              AND claiming_user_id = ?
              AND claiming_organization_id = ?
          `, [replacementClaim, transfer.id, transfer.stripe_checkout_session_id, userId, toOrgId])
          if ((replacement.meta?.changes ?? 0) !== 1) {
            return jsonResponse({ error: 'This handoff changed while its Checkout was being recovered. Retry.' }, { status: 409 })
          }
          activeClaimSessionId = replacementClaim
          releaseOnFailure = true
        }
      }

      const checkoutParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: toOrgId,
        success_url: `${origin}/dashboard/${slug}/onboarding?new=true&transfer=${encodeURIComponent(transfer.id)}`,
        cancel_url: `${origin}/dashboard/${slug}/onboarding?new=true&payment=cancelled&transfer=${encodeURIComponent(transfer.id)}`,
        metadata: {
          type: 'site_transfer',
          referenceId: toOrgId,
          organization_id: toOrgId,
          plan: validatedPlan,
          transfer_request_id: transfer.id,
          transfer_site_id: transfer.site_id,
          transfer_claiming_user_id: userId,
          transfer_claiming_organization_id: toOrgId,
        },
        subscription_data: {
          metadata: {
            referenceId: toOrgId,
            organization_id: toOrgId,
            plan: validatedPlan,
            transfer_request_id: transfer.id,
          },
        },
      }

      if (transfer.invited_coupon) {
        checkoutParams.discounts = [{ coupon: transfer.invited_coupon }]
      }

      if (!await assertClaimHeld()) {
        return jsonResponse({ error: 'This handoff was cancelled before Checkout creation.' }, { status: 409 })
      }
      checkoutCreateStarted = true
      const checkoutSession = await stripe.checkout.sessions.create(checkoutParams, {
          idempotencyKey: transferCheckoutIdempotencyKey(
            transfer.id,
            previousCheckoutSessionId,
          ),
      })
      checkoutCreateResponseReceived = true
      // Capture any real provider ID before validating the rest of the
      // response. A malformed response can still represent a created,
      // payable session that must be expired or quarantined exactly.
      if (typeof checkoutSession?.id === 'string' && checkoutSession.id.trim().length > 0) {
        createdCheckoutSessionId = checkoutSession.id
      }
      if (
        typeof checkoutSession?.id !== 'string'
        || checkoutSession.id.trim().length === 0
        || checkoutSession.status !== 'open'
        || typeof checkoutSession.url !== 'string'
        || checkoutSession.url.trim().length === 0
      ) {
        throw new Error('Stripe checkout session create returned an invalid open session')
      }
      const persistResult = await execute(db, `
        UPDATE site_transfer_requests
        SET stripe_checkout_session_id = ?
        WHERE id = ?
          AND status = 'pending'
          AND stripe_checkout_session_id = ?
          AND claiming_user_id = ?
          AND claiming_organization_id = ?
      `, [checkoutSession.id, transfer.id, activeClaimSessionId, userId, toOrgId])

      if ((persistResult.meta?.changes ?? 0) === 0) {
        throw new Error('Failed to persist or reuse checkout session for this handoff.')
      }
      persistedCheckoutSessionId = checkoutSession.id

      return jsonResponse({ success: true, site_id: transfer.site_id, checkout_url: checkoutSession.url })
    } catch (err) {
      console.error('transfer_checkout_failed', err)
      if (stripe && createdCheckoutSessionId && !persistedCheckoutSessionId) {
        let checkoutExpired = false
        let claimHeld = false
        try {
          claimHeld = await assertClaimHeld()
        } catch (claimError) {
          console.error('transfer_checkout_claim_state_unknown', {
            transferId: transfer.id,
            checkoutSessionId: createdCheckoutSessionId,
            error: claimError,
          })
        }

        // A zero-row persistence CAS can mean another request already bound
        // this exact session (or changed the claim). Never expire a provider
        // resource unless this request still owns its original sentinel.
        if (claimHeld) {
          try {
            const created = await stripe.checkout.sessions.retrieve(createdCheckoutSessionId)
            if (created.status === 'expired') {
              checkoutExpired = true
            } else if (created.status === 'open') {
              try {
                const expired = await stripe.checkout.sessions.expire(createdCheckoutSessionId)
                checkoutExpired = expired.status === 'expired'
              } catch (expireError) {
                console.error('transfer_checkout_expire_after_persistence_failure', {
                  transferId: transfer.id,
                  checkoutSessionId: createdCheckoutSessionId,
                  error: expireError,
                })
              }

              // Expiration can race a successful payment. Only a follow-up read
              // that proves the exact session is expired permits claim release.
              if (!checkoutExpired) {
                try {
                  const latest = await stripe.checkout.sessions.retrieve(createdCheckoutSessionId)
                  checkoutExpired = latest.status === 'expired'
                } catch (latestError) {
                  console.error('transfer_checkout_expiration_state_unknown', {
                    transferId: transfer.id,
                    checkoutSessionId: createdCheckoutSessionId,
                    error: latestError,
                  })
                }
              }
            }
          } catch (retrieveError) {
            console.error('transfer_checkout_retrieve_after_persistence_failure', {
              transferId: transfer.id,
              checkoutSessionId: createdCheckoutSessionId,
              error: retrieveError,
            })
          }
        }

        if (checkoutExpired) {
          await releaseClaim()
          return jsonResponse({ error: 'Failed to start checkout for this handoff.' }, { status: 500 })
        }

        // The provider state is complete, open-but-unexpirable, missing, or
        // otherwise unknown. Bind the exact session to the durable claim so
        // webhook validation can still reconcile it; never release a claim
        // while a created session could remain payable.
        let quarantined = false
        try {
          const quarantine = await execute(db, `
            UPDATE site_transfer_requests
            SET stripe_checkout_session_id = ?
            WHERE id = ? AND status = 'pending'
              AND stripe_checkout_session_id = ?
              AND claiming_user_id = ?
              AND claiming_organization_id = ?
          `, [createdCheckoutSessionId, transfer.id, activeClaimSessionId, userId, toOrgId])
          quarantined = (quarantine.meta?.changes ?? 0) === 1
          if (quarantined) {
            activeClaimSessionId = createdCheckoutSessionId
            releaseOnFailure = false
          } else {
            const current = await queryFirst<{
              status: string
              stripe_checkout_session_id: string | null
              claiming_user_id: string | null
              claiming_organization_id: string | null
            }>(db, `
              SELECT status, stripe_checkout_session_id, claiming_user_id, claiming_organization_id
              FROM site_transfer_requests
              WHERE id = ? LIMIT 1
            `, [transfer.id])
            quarantined = current?.status === 'pending'
              && current.stripe_checkout_session_id === createdCheckoutSessionId
              && current.claiming_user_id === userId
              && current.claiming_organization_id === toOrgId
            if (quarantined) {
              activeClaimSessionId = createdCheckoutSessionId
              releaseOnFailure = false
            }
          }
        } catch (quarantineError) {
          console.error('transfer_checkout_quarantine_failed', {
            transferId: transfer.id,
            checkoutSessionId: createdCheckoutSessionId,
            error: quarantineError,
          })
        }
        if (!quarantined) {
          console.error('transfer_checkout_quarantine_unproven', {
            transferId: transfer.id,
            checkoutSessionId: createdCheckoutSessionId,
          })
        }
        return jsonResponse({
          error: 'Checkout was created but its state could not be safely reconciled. Ask an operator to reconcile it before retrying.',
        }, { status: 503 })
      } else if (checkoutCreateStarted && !checkoutCreateResponseReceived) {
        // Stripe may have accepted an idempotent create while the response
        // was lost. Keep the sentinel fenced rather than risking a duplicate;
        // the operator can reconcile the deterministic idempotency key.
        return jsonResponse({ error: 'Checkout creation is uncertain. Please retry after reconciliation.' }, { status: 503 })
      }
      await releaseClaim()
      return jsonResponse({ error: 'Failed to start checkout for this handoff.' }, { status: 500 })
    }
  }

  try {
    if (!await assertClaimHeld()) {
      return jsonResponse({ error: 'This handoff was cancelled while it was being accepted.' }, { status: 409 })
    }
    await executeSiteTransfer(
      db,
      transfer.site_id,
      transfer.from_organization_id,
      toOrgId,
      transfer.id,
      userId,
      {
        expectedCheckoutSessionId: activeClaimSessionId,
        expectedClaimingUserId: userId,
        expectedClaimingOrganizationId: toOrgId,
      },
    )
  } catch (error) {
    await releaseClaim()
    throw error
  }

  return jsonResponse({ success: true, site_id: transfer.site_id })
})
