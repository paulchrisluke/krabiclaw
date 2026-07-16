// POST /api/dashboard/invitations/[invitationId]/replace
// Re-points a pending WhatsApp/phone-activated manager invitation at a
// different phone number: provisions a fresh invitation for the same
// site/location scopes, then cancels the old one (its email is a
// deterministic function of the phone number, so a new number is a new
// identity). Provisioning happens first so a transient failure never
// strands the org without a working invitation — see the ordering comment
// below.
// See issue #293 Section A.4.
import { getHeaders } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { execute } from '~/server/db'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { ensureWhatsAppRecipientAccess, loadPendingPhoneInvitation, sendWhatsAppAccessInvitation } from '~/server/utils/whatsapp-access'
import { parsePhone } from '~/utils/phone'

interface CancelInvitationApi {
  cancelInvitation(_input: {
    body: { invitationId: string }
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

export default defineEventHandler(async (event) => {
  const invitationId = String(getRouterParam(event, 'invitationId') || '').trim()
  if (!invitationId) return jsonResponse({ error: 'Invitation id is required' }, { status: 400 })

  const body = await readBody<{ phone?: unknown }>(event)
  const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  if (!rawPhone) return jsonResponse({ error: 'A phone number is required' }, { status: 400 })

  // Manager/operational identity paths reject invalid numbers outright
  // (per utils/phone.ts's contract) rather than falling back to a raw value.
  const parsed = parsePhone(rawPhone, { defaultCountry: 'TH' })
  if (!parsed.valid || !parsed.e164) {
    return jsonResponse({ error: 'Enter a valid phone number, including country code' }, { status: 400 })
  }
  const newPhone = parsed.e164

  const env = cloudflareEnv(event)
  const { db, session, organization } = await getDashboardContext(event, { requireSite: false })

  if (!isOrganizationWideRole(organization.role)) {
    return jsonResponse({ error: 'Only owners and admins can manage WhatsApp invitations' }, { status: 403 })
  }

  const invitation = await loadPendingPhoneInvitation(db, organization.id, invitationId)
  if (!invitation) return jsonResponse({ error: 'Pending WhatsApp invitation not found' }, { status: 404 })
  if (invitation.scopes.length === 0) {
    return jsonResponse({ error: 'This invitation has no assigned site or location' }, { status: 409 })
  }
  if (newPhone === invitation.phone) {
    return jsonResponse({ error: 'This is already the assigned phone number' }, { status: 409 })
  }

  // Provision the new invitation BEFORE cancelling the old one. The old and
  // new invitations use different deterministic emails (one per phone
  // number — see header comment), so there's no uniqueness conflict with
  // having both exist at once, and provisioning first means a transient
  // failure here never leaves the org without a working invitation: the old
  // one is simply left pending and retryable. Cancellation only happens
  // once the replacement is confirmed active (CodeRabbit follow-up on
  // PR #295 — the old ordering cancelled first and could strand the org
  // with neither invitation if provisioning then failed).
  const auth = createAuth(env)
  const cancelApi = auth.api as unknown as CancelInvitationApi

  // Track all newly created invitations for rollback if provisioning fails.
  const newInvitationIds: string[] = []
  let shouldDeliver = false
  let deliveryScope: { site_id: string; location_id: string | null } | null = null

  try {
    for (const scope of invitation.scopes) {
      const access = await ensureWhatsAppRecipientAccess(db, {
        organizationId: organization.id,
        siteId: scope.site_id,
        locationId: scope.location_id,
        phone: newPhone,
        inviterUserId: session.user.id,
      })
      if (access.status === 'invitation_pending' && access.invitationId) {
        newInvitationIds.push(access.invitationId)
        if (access.shouldDeliverInvitation) {
          shouldDeliver = true
          deliveryScope = scope
        }
      }
    }

    if (newInvitationIds.length > 0 && shouldDeliver && deliveryScope) {
      const primaryInvitationId = newInvitationIds[0]
      if (primaryInvitationId) {
        await sendWhatsAppAccessInvitation(env, db, {
          organizationId: organization.id,
          siteId: deliveryScope.site_id,
          locationId: deliveryScope.location_id,
          phone: newPhone,
          invitationId: primaryInvitationId,
        })
      }
    }
  } catch (error) {
    console.error('whatsapp_invitation_replace_provision_failed', { invitationId, error: error instanceof Error ? error.message : String(error) })

    // Compensating saga: roll back any newly created invitations
    for (const newId of newInvitationIds) {
      try {
        const cancelResponse = await cancelApi.cancelInvitation({
          body: { invitationId: newId },
          headers: getHeaders(event) as HeadersInit,
          asResponse: true,
        })
        if (cancelResponse.ok) {
          await execute(db, `DELETE FROM invitation_access_scope WHERE invitation_id = ?`, [newId])
        }
      } catch (rollbackError) {
        console.error('whatsapp_invitation_replace_rollback_failed', { newId, error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) })
      }
    }

    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to provision the replacement invitation' }, { status: 502 })
  }

  // Replacement is confirmed active — cancel the old invitation now. If this
  // fails after retrying, the replacement itself is still fully working; the
  // old invitation is just left pending (its phone number is already stale,
  // so it grants no additional access) and can be retried separately, rather
  // than reporting the whole operation as failed.
  const cancelOldInvitation = async (): Promise<boolean> => {
    try {
      const response = await cancelApi.cancelInvitation({
        body: { invitationId },
        headers: getHeaders(event) as HeadersInit,
        asResponse: true,
      })
      if (!response.ok) {
        console.error('whatsapp_invitation_replace_cancel_old_failed', { invitationId, status: response.status })
        return false
      }
      await execute(db, `DELETE FROM invitation_access_scope WHERE invitation_id = ?`, [invitationId])
      return true
    } catch (error) {
      console.error('whatsapp_invitation_replace_cancel_old_failed', { invitationId, error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  let cancelledOld = await cancelOldInvitation()
  if (!cancelledOld) cancelledOld = await cancelOldInvitation()

  return jsonResponse({
    success: true,
    invitationId: newInvitationIds[0] || null,
    oldInvitationCancelled: cancelledOld,
    ...(cancelledOld ? {} : { warning: 'The replacement is active, but the previous invitation could not be cancelled automatically. Retry cancelling it separately.' }),
  })
})
