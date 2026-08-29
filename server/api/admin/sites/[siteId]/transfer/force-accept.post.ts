// POST /api/admin/sites/[siteId]/transfer/force-accept
// Admin-only: execute or retry a transfer without the recipient going through Stripe checkout
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { execute, queryAll } from '~/server/db'
import { getOrganizationBillingProjection } from '~/server/utils/organization-billing'
import {
  completePaidSiteTransfer, executeSiteTransfer, newTransferClaimSentinel, } from '~/server/utils/site-transfer'
import { resolveTransferRecipientOrganizationsForEvent } from '~/server/utils/site-transfer-recipient'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['organizations'] })
  if (permissionDenied) return permissionDenied

  let body: { organizationId?: string } = {}
  try {
    body = (await readBody(event)) ?? {}
  } catch {
    return jsonResponse({ error: 'organizationId is required' }, { status: 400 })
  }
  const organizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : ''
  if (!organizationId) return jsonResponse({ error: 'organizationId is required' }, { status: 400 })

  // There must be exactly one eligible transfer for the requested site. Never
  // silently select an arbitrary historical request for an operator action.
  const transfers = await queryAll<{
    id: string
    site_id: string
    from_organization_id: string
    to_email: string
    status: string
    requires_payment: number
    claiming_user_id: string | null
    claiming_organization_id: string | null
    stripe_checkout_session_id: string | null
    payment_completed_at: string | null
  }>(db, `
    SELECT id, site_id, from_organization_id, to_email, status, requires_payment, claiming_user_id, claiming_organization_id, stripe_checkout_session_id, payment_completed_at
    FROM site_transfer_requests
    WHERE site_id = ?
      AND (
        status = 'pending'
        OR (status = 'accepted' AND requires_payment = 1 AND payment_completed_at IS NULL)
      )
    ORDER BY created_at DESC
  `, [siteId])

  if (!transfers?.length) return jsonResponse({ error: 'No pending transfer found for this site.' }, { status: 404 })
  if (transfers.length !== 1) {
    return jsonResponse({ error: 'Multiple eligible transfers exist for this site; reconcile the exact transfer before force-accept.' }, { status: 409 })
  }
  const transfer = transfers[0]!

  const recipient = await resolveTransferRecipientOrganizationsForEvent(event, env, transfer.to_email)
  if (recipient.status === 'missing') {
    return jsonResponse({ error: `${transfer.to_email} has not created an account yet.` }, { status: 422 })
  }
  if (recipient.status === 'ambiguous') {
    return jsonResponse({ error: 'Multiple exact matching recipient accounts found.' }, { status: 422 })
  }
  if (recipient.status === 'no_owned_organization' || !recipient.userId) {
    return jsonResponse({ error: 'The recipient does not own an organization yet.' }, { status: 422 })
  }
  if (!recipient.organizations.some(organization => organization.id === organizationId)) {
    return jsonResponse({ error: 'The exact recipient account is not an owner of the requested organization.' }, { status: 409 })
  }
  const recipientUserId = recipient.userId

  if (organizationId === transfer.from_organization_id) {
    return jsonResponse({ error: 'Recipient already owns this site.' }, { status: 422 })
  }

  const acceptedPaymentPending = transfer.status === 'accepted'
    && transfer.requires_payment === 1
    && !transfer.payment_completed_at
  if (acceptedPaymentPending && (
    transfer.claiming_user_id !== recipientUserId
    || transfer.claiming_organization_id !== organizationId
  )) {
    return jsonResponse({ error: 'Accepted transfer claimant does not match the recipient account.' }, { status: 409 })
  }

  // Guard check: if transfer requires payment, ensure the recipient organization
  // has a non-free effective plan. Billing is organization-scoped; the source
  // site ownership must not authorize the recipient's organization access.
  if (transfer.requires_payment === 1) {
    const billingProjection = await getOrganizationBillingProjection(db, organizationId)

    if (billingProjection.effectivePlan === 'free') {
      return jsonResponse({
        error: 'This transfer requires payment. The recipient must have an active billing subscription before the transfer can proceed.', }, { status: 402 })
    }
  }

  let claimSentinel: string | null = null
  if (!acceptedPaymentPending) {
    if (transfer.status !== 'pending') {
      return jsonResponse({ error: `Transfer is already ${transfer.status}.` }, { status: 409 })
    }
    if (transfer.stripe_checkout_session_id) {
      return jsonResponse({ error: 'This transfer has an existing claim or Checkout session; reconcile it before force-accept.' }, { status: 409 })
    }
    claimSentinel = newTransferClaimSentinel()
    const claim = await execute(db, `
      UPDATE site_transfer_requests
      SET claiming_user_id = ?, claiming_organization_id = ?, stripe_checkout_session_id = ?
      WHERE id = ? AND status = 'pending' AND stripe_checkout_session_id IS NULL
    `, [recipientUserId, organizationId, claimSentinel, transfer.id])
    if ((claim.meta?.changes ?? 0) !== 1) {
      return jsonResponse({ error: 'Transfer changed while it was being claimed. Retry after reconciliation.' }, { status: 409 })
    }
  }

  try {
    if (!acceptedPaymentPending) {
      await executeSiteTransfer(
        db, transfer.site_id, transfer.from_organization_id, organizationId, transfer.id, recipientUserId, {
          expectedCheckoutSessionId: claimSentinel, expectedClaimingUserId: recipientUserId, expectedClaimingOrganizationId: organizationId, }, )
    }
    if (transfer.requires_payment === 1) {
      await completePaidSiteTransfer(env, db, transfer.id)
    }
  } catch (error) {
    console.error('force_accept_site_transfer_completion_failed', {
      transferId: transfer.id, siteId: transfer.site_id, error, })
    if (claimSentinel) {
      try {
        await execute(db, `
          UPDATE site_transfer_requests
          SET claiming_user_id = NULL, claiming_organization_id = NULL, stripe_checkout_session_id = NULL
          WHERE id = ? AND status = 'pending'
            AND stripe_checkout_session_id = ?
            AND claiming_user_id = ? AND claiming_organization_id = ?
        `, [transfer.id, claimSentinel, recipientUserId, organizationId])
      } catch (cleanupError) {
        console.error('force_accept_site_transfer_claim_cleanup_failed', {
          transferId: transfer.id, siteId: transfer.site_id, cleanupError, })
      }
    }
    return jsonResponse({ error: 'Failed to complete this site handoff. Please retry.' }, { status: 500 })
  }

  return jsonResponse({
    success: true, site_id: transfer.site_id, transferred_to_org: organizationId, to_email: transfer.to_email, })
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
