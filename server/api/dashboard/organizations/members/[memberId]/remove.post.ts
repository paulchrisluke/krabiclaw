// POST /api/dashboard/organizations/members/[memberId]/remove
// Member-led revocation (issue #293 Section H). Better Auth's org-plugin
// `member.delete.after` hook is `after`-only and cannot block/veto — the only
// enforcement point for "identify assignments before removing a
// location_manager, require a deliberate clear/reassign action" is this
// server route, which is now the only path `members.vue` calls (it no longer
// calls `authClient.organization.removeMember` directly).
//
// Org context is resolved from the session (getDashboardContext), matching
// the retry/replace/clear WhatsApp-invitation routes in
// server/api/dashboard/invitations/[invitationId]/, not from a URL param —
// a member id is already globally unambiguous, but resolving the acting
// org/role from the session (rather than trusting a client-supplied org id)
// keeps the owner/admin permission check tamper-proof.
import { getHeaders } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole, LOCATION_MANAGER_ROLE } from '~/server/utils/member-access'
import { clearOrReassignAssignments, findAssignmentsForMemberPhone, type PhoneAssignment } from '~/server/utils/whatsapp-revocation'

interface RemoveMemberApi {
  removeMember(_input: {
    body: { memberIdOrEmail: string; organizationId: string }
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

export default defineEventHandler(async (event) => {
  const memberId = String(getRouterParam(event, 'memberId') || '').trim()
  if (!memberId) return jsonResponse({ error: 'Member id is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const { db, organization } = await getDashboardContext(event, { requireSite: false })

  // Never allow a location_manager (or any non-org-wide role) to remove
  // members — matches the existing WhatsApp-invitation management routes.
  if (!isOrganizationWideRole(organization.role)) {
    return jsonResponse({ error: 'Only owners and admins can remove members' }, { status: 403 })
  }

  const member = await queryFirst<{ id: string; organizationId: string; role: string; userId: string }>(db, `
    SELECT id, organizationId, role, userId FROM member WHERE id = ? AND organizationId = ? LIMIT 1
  `, [memberId, organization.id])
  if (!member) return jsonResponse({ error: 'Member not found' }, { status: 404 })

  const body = await readBody<{ action?: string; confirmed?: boolean }>(event).catch(() => null)
  const confirmedClear = body?.action === 'clear' && body?.confirmed === true

  let clearedAssignments: PhoneAssignment[] = []
  if (member.role === LOCATION_MANAGER_ROLE) {
    const assignments = await findAssignmentsForMemberPhone(db, memberId)
    if (assignments.length > 0 && !confirmedClear) {
      // Block raw removal with actionable guidance rather than silently
      // proceeding and leaving stale notification_phone/site_config pointers.
      return jsonResponse({
        error: 'This member has active WhatsApp notification assignments. Confirm to clear them and continue.',
        requiresConfirmation: true,
        assignments,
      }, { status: 409 })
    }
    if (assignments.length > 0 && confirmedClear) {
      const result = await clearOrReassignAssignments(db, memberId, { action: 'clear' })
      clearedAssignments = result.cleared
    }
  }

  const auth = createAuth(env)
  const removeApi = auth.api as unknown as RemoveMemberApi

  let response: Response
  try {
    response = await removeApi.removeMember({
      body: { memberIdOrEmail: member.id, organizationId: member.organizationId },
      headers: getHeaders(event) as HeadersInit,
      asResponse: true,
    })
  } catch (error) {
    console.error('dashboard_member_remove_failed', { memberId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to remove member' }, { status: 502 })
  }

  if (!response.ok) {
    let message = 'Failed to remove member'
    try {
      const data = await response.json() as { message?: string; error?: string }
      message = data.message || data.error || message
    } catch {
      const text = await response.text().catch(() => '')
      if (text) message = text
    }
    return jsonResponse({ error: message }, { status: response.status || 500 })
  }

  // member row (and its now-empty member_access_scope rows, if any survived)
  // is gone at this point — never the underlying Better Auth `user` row.
  return jsonResponse({ success: true, clearedAssignments })
})
