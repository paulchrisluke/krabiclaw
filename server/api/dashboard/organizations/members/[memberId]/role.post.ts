// POST /api/dashboard/organizations/members/[memberId]/role
//
// Better Auth's organization plugin has no dashboard-facing role-change UI of
// its own — auth.api.updateMemberRole is the documented server API for this
// (https://www.better-auth.com/docs/plugins/organization), and already
// enforces the invariants that matter (only an existing owner can grant or
// touch the owner role, the last owner can't demote themselves). This route
// wraps that call the same way remove.post.ts wraps removeMember, and layers
// nothing on top: owner and admin are both organization-wide, so there is no
// scope to reconcile beside the role Better Auth already stores.

import { jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { findOrganizationMemberById, isOrganizationWideRole } from '~/server/utils/member-access'

const ALLOWED_ROLES = new Set(['admin', 'owner'])

interface UpdateMemberRoleApi {
  updateMemberRole(_input: {
    body: { memberId: string; role: string; organizationId: string }
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

export default defineHandler(async (event) => {
  const memberId = String(getRouterParam(event, 'memberId') || '').trim()
  if (!memberId) return jsonResponse({ error: 'Member id is required' }, { status: 400 })

  const { env, organization } = await getDashboardContext(event, {})
  if (!isOrganizationWideRole(organization.role)) {
    return jsonResponse({ error: 'Only owners and admins can change member roles' }, { status: 403 })
  }

  const body = await readBody(event).catch(() => null) as { role?: unknown } | null
  const role = typeof body?.role === 'string' ? body.role.trim() : ''

  if (!ALLOWED_ROLES.has(role)) {
    return jsonResponse({ error: 'Role must be admin or owner' }, { status: 400 })
  }
  if (role === 'owner' && organization.role !== 'owner') {
    return jsonResponse({ error: 'Only an owner can grant the owner role' }, { status: 403 })
  }

  const target = await findOrganizationMemberById(env, memberId)
  if (!target || target.organizationId !== organization.id) {
    return jsonResponse({ error: 'Member not found' }, { status: 404 })
  }

  const auth = createAuth(env)
  const roleApi = auth.api as unknown as UpdateMemberRoleApi

  let response: Response
  try {
    response = await roleApi.updateMemberRole({
      body: { memberId: target.id, role, organizationId: organization.id }, headers: Object.fromEntries(event.req.headers.entries()) as HeadersInit, asResponse: true, })
  } catch (error) {
    console.error('dashboard_member_role_update_failed', {
      memberId: target.id, error: error instanceof Error ? error.message : String(error), })
    return jsonResponse({ error: 'Failed to update member role' }, { status: 502 })
  }

  if (!response.ok) {
    let message = 'Failed to update member role'
    try {
      const data = await response.json() as { message?: string; error?: string }
      message = data.message || data.error || message
    } catch {
      const text = await response.text().catch(() => '')
      if (text) message = text
    }
    return jsonResponse({ error: message }, { status: response.status || 500 })
  }

  return jsonResponse({ success: true, memberId: target.id, role })
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
