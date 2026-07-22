import { executeBatch, queryAll, queryFirst, type BatchQuery } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { fireSiteEventSafe } from '~/server/utils/site-events'

const ALLOWED_INVITATION_ROLES = new Set(['member', 'admin', 'editor'])

export default defineEventHandler(async (event) => {
  const { db, session, organization } = await getDashboardContext(event, { requireSite: false })
  if (!isOrganizationWideRole(organization.role)) {
    return jsonResponse({ error: 'Only owners and admins can invite organization members' }, { status: 403 })
  }

  const body = await readBody(event).catch(() => null) as {
    email?: unknown
    role?: unknown
    siteId?: unknown
    locationId?: unknown
  } | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body?.role === 'string' ? body.role.trim() : ''
  const siteId = typeof body?.siteId === 'string' ? body.siteId.trim() : ''
  const locationId = typeof body?.locationId === 'string' && body.locationId.trim() ? body.locationId.trim() : null

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return jsonResponse({ error: 'Enter a valid email address' }, { status: 400 })
  }
  if (!ALLOWED_INVITATION_ROLES.has(role)) {
    return jsonResponse({ error: 'Invitation role must be member, admin, or editor' }, { status: 400 })
  }
  if (role === 'editor' && !siteId) {
    return jsonResponse({ error: 'Editors must be assigned to a site' }, { status: 400 })
  }

  if (await queryFirst<{ id: string }>(db, `
    SELECT m.id FROM member m
    JOIN user u ON u.id = m.userId
    WHERE m.organizationId = ? AND lower(u.email) = lower(?)
    LIMIT 1
  `, [organization.id, email])) {
    return jsonResponse({ error: 'This user is already a member of the organization' }, { status: 409 })
  }

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

  const existing = await queryFirst<{ id: string; role: string | null }>(db, `
    SELECT id, role FROM invitation
    WHERE organizationId = ? AND lower(email) = lower(?) AND status = 'pending'
    LIMIT 1
  `, [organization.id, email])
  if (existing && existing.role !== role) {
    return jsonResponse({ error: `A pending ${existing.role || 'member'} invitation already exists for this email` }, { status: 409 })
  }

  const invitationId = existing?.id ?? crypto.randomUUID()
  const nowSeconds = Math.floor(Date.now() / 1000)
  const expiresAt = nowSeconds + 48 * 60 * 60
  const statements: BatchQuery[] = existing
    ? [{
        query: `UPDATE invitation SET expiresAt = ? WHERE id = ? AND status = 'pending'`,
        params: [expiresAt, invitationId],
      }]
    : [{
        query: `INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
                VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
        params: [invitationId, organization.id, email, role, expiresAt, session.user.id, nowSeconds],
      }]

  if (role === 'editor') {
    const existingScopes = existing
      ? await queryAll<{ site_id: string; location_id: string | null }>(db, `
          SELECT site_id, location_id FROM invitation_access_scope WHERE invitation_id = ?
        `, [invitationId])
      : []
    const exactScopeExists = existingScopes.some(scope => scope.site_id === siteId && scope.location_id === locationId)
    if (!exactScopeExists) {
      statements.push({
        query: `INSERT INTO invitation_access_scope
                  (id, invitation_id, organization_id, site_id, location_id, grant_source, created_at)
                VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
        params: [crypto.randomUUID(), invitationId, organization.id, siteId, locationId, new Date().toISOString()],
      })
    }
  }

  try {
    // D1 batches are atomic: an editor invitation can never become visible
    // without its required access scope, and retrying the same request reuses
    // the pending invitation instead of creating a duplicate.
    await executeBatch(db, statements)
  } catch (error) {
    console.error('dashboard_invitation_create_failed', {
      organizationId: organization.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonResponse({ error: 'Failed to create the invitation' }, { status: 500 })
  }

  if (!existing) {
    const eventSiteId = siteId || (await queryFirst<{ id: string }>(db, `
      SELECT id FROM sites WHERE organization_id = ? ORDER BY created_at ASC LIMIT 1
    `, [organization.id]))?.id
    if (eventSiteId) {
    await fireSiteEventSafe({
      db,
      organizationId: organization.id,
        siteId: eventSiteId,
      actorId: session.user.id,
      eventType: 'member.invited',
      entityType: 'invitation',
      entityId: invitationId,
      metadata: { role },
    })
    }
  }

  return jsonResponse({ success: true, invitationId, reused: Boolean(existing) })
})
