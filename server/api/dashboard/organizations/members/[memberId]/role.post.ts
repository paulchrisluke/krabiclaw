// POST /api/dashboard/organizations/members/[memberId]/role
//
// Better Auth's organization plugin has no dashboard-facing role-change UI of
// its own — auth.api.updateMemberRole is the documented server API for this
// (https://www.better-auth.com/docs/plugins/organization), and already
// enforces the invariants that matter (only an existing owner can grant or
// touch the owner role, the last owner can't demote themselves). This route
// wraps that call the same way remove.post.ts wraps removeMember: the only
// thing layered on top is our app-specific site/location team scoping for
// the 'editor' role, which Better Auth's flat role model has no concept of.
import { getHeaders } from 'h3'
import { queryFirst } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { addMemberResourceAccess, isOrganizationWideRole, isScopedRole, removeAllMemberResourceAccess } from '~/server/utils/member-access'

const ALLOWED_ROLES = new Set(['member', 'admin', 'editor', 'owner'])

interface UpdateMemberRoleApi {
  updateMemberRole(_input: {
    body: { memberId: string; role: string; organizationId: string }
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

export default defineEventHandler(async (event) => {
  const memberId = String(getRouterParam(event, 'memberId') || '').trim()
  if (!memberId) return jsonResponse({ error: 'Member id is required' }, { status: 400 })

  const { env, db, organization } = await getDashboardContext(event, { requireSite: false })
  if (!isOrganizationWideRole(organization.role)) {
    return jsonResponse({ error: 'Only owners and admins can change member roles' }, { status: 403 })
  }

  const body = await readBody(event).catch(() => null) as {
    role?: unknown
    siteId?: unknown
    locationId?: unknown
  } | null
  const role = typeof body?.role === 'string' ? body.role.trim() : ''
  const siteId = typeof body?.siteId === 'string' ? body.siteId.trim() : ''
  const locationId = typeof body?.locationId === 'string' && body.locationId.trim() ? body.locationId.trim() : null

  if (!ALLOWED_ROLES.has(role)) {
    return jsonResponse({ error: 'Role must be member, admin, editor, or owner' }, { status: 400 })
  }
  if (role === 'owner' && organization.role !== 'owner') {
    return jsonResponse({ error: 'Only an owner can grant the owner role' }, { status: 403 })
  }
  if (role === 'editor' && !siteId) {
    return jsonResponse({ error: 'Editors must be assigned to a site' }, { status: 400 })
  }

  const target = await queryFirst<{ id: string; userId: string; role: string }>(db, `
    SELECT id, userId, role FROM member WHERE id = ? AND organizationId = ? LIMIT 1
  `, [memberId, organization.id])
  if (!target) return jsonResponse({ error: 'Member not found' }, { status: 404 })

  if (role === 'editor') {
    const site = await queryFirst<{ id: string }>(db, `
      SELECT id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
    `, [siteId, organization.id])
    if (!site) return jsonResponse({ error: 'siteId must reference a site in this organization' }, { status: 400 })

    if (locationId) {
      const location = await queryFirst<{ id: string }>(db, `
        SELECT id FROM business_locations
        WHERE id = ? AND site_id = ? AND organization_id = ?
        LIMIT 1
      `, [locationId, siteId, organization.id])
      if (!location) return jsonResponse({ error: 'locationId must reference a location on that site' }, { status: 400 })
    }
  }

  const auth = createAuth(env)
  const roleApi = auth.api as unknown as UpdateMemberRoleApi

  let response: Response
  try {
    response = await roleApi.updateMemberRole({
      body: { memberId: target.id, role, organizationId: organization.id },
      headers: getHeaders(event) as HeadersInit,
      asResponse: true,
    })
  } catch (error) {
    console.error('dashboard_member_role_update_failed', {
      memberId: target.id,
      error: error instanceof Error ? error.message : String(error),
    })
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

  // Better Auth's role column is now authoritative — reconcile our
  // app-specific site/location Teams scoping (which it has no concept of)
  // to match.
  if (role === 'editor') {
    await addMemberResourceAccess(db, {
      env,
      userId: target.userId,
      organizationId: organization.id,
      siteId,
      locationId,
    })
  } else if (isScopedRole(target.role)) {
    await removeAllMemberResourceAccess(db, { env, organizationId: organization.id, userId: target.userId })
  }

  return jsonResponse({ success: true, memberId: target.id, role })
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
import { readBody } from 'h3'
