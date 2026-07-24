// POST /api/dashboard/invitations/[invitationId]/retry
// Re-sends a WhatsApp/phone-activated manager invitation that failed to
// deliver (or simply expired) without changing the assigned phone number.
// See issue #293 Section A.4 (retry/replace/clear actions).
import { getHeaders } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { execute } from '~/server/db'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { ensureWhatsAppRecipientAccess, loadPendingPhoneInvitation, pickPrimaryInvitationScope, sendWhatsAppAccessInvitation } from '~/server/utils/whatsapp-access'

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

  const env = cloudflareEnv(event)
  const { db, session, organization } = await getDashboardContext(event, { requireSite: false })

  if (!isOrganizationWideRole(organization.role)) {
    return jsonResponse({ error: 'Only owners and admins can manage WhatsApp invitations' }, { status: 403 })
  }

  const invitation = await loadPendingPhoneInvitation(db, organization.id, invitationId)
  if (!invitation) return jsonResponse({ error: 'Pending WhatsApp invitation not found' }, { status: 404 })

  const primaryScope = pickPrimaryInvitationScope(invitation.scopes)
  if (!primaryScope) return jsonResponse({ error: 'This invitation has no assigned site or location' }, { status: 409 })

  try {
    // Provision every stored scope, not just the primary one. If the phone was
    // verified elsewhere in the meantime, ensureWhatsAppRecipientAccess grants
    // resource team membership per scope.
    let allActive = true
    let resolvedInvitationId = invitation.id
    for (const scope of invitation.scopes) {
      const access = await ensureWhatsAppRecipientAccess(db, {
        organizationId: organization.id,
        siteId: scope.site_id,
        locationId: scope.location_id,
        phone: invitation.phone,
        inviterUserId: session.user.id,
      })
      if (access.status === 'invitation_pending') {
        allActive = false
        if (access.invitationId) resolvedInvitationId = access.invitationId
      }
    }

    if (allActive) {
      // The recipient already completed OTP verification for every assigned
      // scope in the meantime — cancel and clear the now-obsolete pending
      // invitation instead of leaving it around to be retried again.
      const auth = createAuth(env)
      const cancelApi = auth.api as unknown as CancelInvitationApi
      try {
        const response = await cancelApi.cancelInvitation({
          body: { invitationId },
          headers: getHeaders(event) as HeadersInit,
          asResponse: true,
        })
        if (response.ok) {
          await execute(db, `DELETE FROM invitation_access_scope WHERE invitation_id = ?`, [invitationId])
        } else {
          console.warn('whatsapp_invitation_retry_cancel_stale_failed', { invitationId, status: response.status })
        }
      } catch (error) {
        console.warn('whatsapp_invitation_retry_cancel_stale_failed', { invitationId, error: error instanceof Error ? error.message : String(error) })
      }
      return jsonResponse({ success: true, status: 'active' })
    }

    await sendWhatsAppAccessInvitation(env, db, {
      organizationId: organization.id,
      siteId: primaryScope.site_id,
      locationId: primaryScope.location_id,
      phone: invitation.phone,
      invitationId: resolvedInvitationId,
    })

    return jsonResponse({ success: true, status: 'invitation_pending', invitationId: resolvedInvitationId })
  } catch (error) {
    console.error('whatsapp_invitation_retry_failed', { invitationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to resend the WhatsApp invitation' }, { status: 502 })
  }
})
