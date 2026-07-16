// POST /api/dashboard/invitations/[invitationId]/replace
// Re-points a pending WhatsApp/phone-activated manager invitation at a
// different phone number: cancels the old invitation (its email is a
// deterministic function of the phone number, so a new number is a new
// identity) and provisions a fresh one for the same site/location scopes.
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

  let newInvitationId: string | null = null
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
        newInvitationId = access.invitationId
        if (access.shouldDeliverInvitation) {
          shouldDeliver = true
          deliveryScope = scope
        }
      }
    }

    if (newInvitationId && shouldDeliver && deliveryScope) {
      await sendWhatsAppAccessInvitation(env, db, {
        organizationId: organization.id,
        siteId: deliveryScope.site_id,
        locationId: deliveryScope.location_id,
        phone: newPhone,
        invitationId: newInvitationId,
      })
    }
  } catch (error) {
    console.error('whatsapp_invitation_replace_provision_failed', { invitationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to provision the replacement invitation' }, { status: 502 })
  }

  // Old invitation is now superseded — cancel it via Better Auth (keeps its
  // own status/permission invariants) then clean up its now-obsolete scopes.
  // Unlike a true best-effort cleanup, a failure here must NOT be reported as
  // full success: the old invitation would remain usable, so a caller could
  // end up with both the old and new phone numbers active simultaneously.
  // We retry the cancellation once (transient network/API blips are the most
  // likely failure mode), and if it still fails, report an explicit partial
  // result rather than `{ success: true }` — the new invitation already
  // exists and is not rolled back (that risks destroying the only working
  // path if the compensating cancel also fails), but the caller must know to
  // retry clearing/cancelling the old invitation.
  const auth = createAuth(env)
  const cancelApi = auth.api as unknown as CancelInvitationApi

  const cancelOldInvitation = async (): Promise<boolean> => {
    try {
      const response = await cancelApi.cancelInvitation({
        body: { invitationId },
        headers: getHeaders(event) as HeadersInit,
        asResponse: true,
      })
      if (!response.ok) {
        console.warn('whatsapp_invitation_replace_cancel_old_failed', { invitationId, status: response.status })
        return false
      }
      await execute(db, `DELETE FROM invitation_access_scope WHERE invitation_id = ?`, [invitationId])
      return true
    } catch (error) {
      console.warn('whatsapp_invitation_replace_cancel_old_failed', { invitationId, error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  let cancelledOld = await cancelOldInvitation()
  if (!cancelledOld) cancelledOld = await cancelOldInvitation()

  if (!cancelledOld) {
    console.error('whatsapp_invitation_replace_old_still_active', { invitationId, newInvitationId })
    return jsonResponse({
      success: false,
      invitationId: newInvitationId,
      oldInvitationId: invitationId,
      oldInvitationActive: true,
      error: 'The new phone number was provisioned, but the previous invitation could not be cancelled and is still active. Please retry clearing it.',
    }, { status: 502 })
  }

  return jsonResponse({ success: true, invitationId: newInvitationId })
})
