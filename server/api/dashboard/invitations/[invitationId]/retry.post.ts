// POST /api/dashboard/invitations/[invitationId]/retry
// Re-sends a WhatsApp/phone-activated manager invitation that failed to
// deliver (or simply expired) without changing the assigned phone number.
// See issue #293 Section A.4 (retry/replace/clear actions).
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { ensureWhatsAppRecipientAccess, loadPendingPhoneInvitation, pickPrimaryInvitationScope, sendWhatsAppAccessInvitation } from '~/server/utils/whatsapp-access'

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

  const scope = pickPrimaryInvitationScope(invitation.scopes)
  if (!scope) return jsonResponse({ error: 'This invitation has no assigned site or location' }, { status: 409 })

  try {
    const access = await ensureWhatsAppRecipientAccess(db, {
      organizationId: organization.id,
      siteId: scope.site_id,
      locationId: scope.location_id,
      phone: invitation.phone,
      inviterUserId: session.user.id,
    })

    if (access.status === 'active') {
      // The recipient already completed OTP verification for another
      // assignment in the meantime — nothing left to (re)send.
      return jsonResponse({ success: true, status: 'active' })
    }

    await sendWhatsAppAccessInvitation(env, db, {
      organizationId: organization.id,
      siteId: scope.site_id,
      locationId: scope.location_id,
      phone: invitation.phone,
      invitationId: access.invitationId ?? invitation.id,
    })

    return jsonResponse({ success: true, status: 'invitation_pending', invitationId: access.invitationId ?? invitation.id })
  } catch (error) {
    console.error('whatsapp_invitation_retry_failed', { invitationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to resend the WhatsApp invitation' }, { status: 502 })
  }
})
