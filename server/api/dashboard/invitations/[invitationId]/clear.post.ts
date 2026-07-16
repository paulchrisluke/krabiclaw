// POST /api/dashboard/invitations/[invitationId]/clear
// Cancels a pending WhatsApp/phone-activated manager invitation and removes
// its site/location scope rows, so a cleared assignment can't silently
// re-invite the same phone number on a later config save (see
// ensureWhatsAppRecipientAccess, which reuses any still-pending invitation
// for the same org+email). See issue #293 Section A.4.
import { getHeaders } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { execute } from '~/server/db'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { loadPendingPhoneInvitation } from '~/server/utils/whatsapp-access'

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
  const { db, organization } = await getDashboardContext(event, { requireSite: false })

  if (!isOrganizationWideRole(organization.role)) {
    return jsonResponse({ error: 'Only owners and admins can manage WhatsApp invitations' }, { status: 403 })
  }

  const invitation = await loadPendingPhoneInvitation(db, organization.id, invitationId)
  if (!invitation) return jsonResponse({ error: 'Pending WhatsApp invitation not found' }, { status: 404 })

  const auth = createAuth(env)
  const cancelApi = auth.api as unknown as CancelInvitationApi

  // Remove scopes first. If this write fails the invitation remains pending,
  // so the whole operation is safely retryable. If Better Auth cancellation
  // subsequently fails, a retry can still load the pending invitation and
  // finish cancellation; ensureWhatsAppRecipientAccess will recreate any
  // required scope if the assignment is saved again in the meantime.
  try {
    await execute(db, `DELETE FROM invitation_access_scope WHERE invitation_id = ?`, [invitationId])
  } catch (error) {
    console.error('whatsapp_invitation_clear_scope_cleanup_failed', {
      invitationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonResponse({ error: 'Failed to clear invitation access. Please retry.' }, { status: 502 })
  }

  let response: Response
  try {
    response = await cancelApi.cancelInvitation({
      body: { invitationId },
      headers: getHeaders(event) as HeadersInit,
      asResponse: true,
    })
  } catch (error) {
    console.error('whatsapp_invitation_clear_failed', { invitationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to cancel invitation' }, { status: 502 })
  }

  if (!response.ok) {
    let message = 'Failed to cancel invitation'
    try {
      const data = await response.json() as { message?: string; error?: string }
      message = data.message || data.error || message
    } catch {
      const text = await response.text().catch(() => '')
      if (text) message = text
    }
    return jsonResponse({ error: message }, { status: response.status || 500 })
  }

  return jsonResponse({ success: true })
})
