// POST /api/dashboard/invitations/[invitationId]/scope
// Attaches a site/location access scope to a pending 'editor' invitation.
// invitation_access_scope rows are materialized into member_access_scope
// once the invitation is accepted (see server/api/invitations/[invitationId]/accept.post.ts) —
// this is the same mechanism the WhatsApp/phone-invite flow already uses
// (server/utils/whatsapp-access.ts's ensureWhatsAppRecipientAccess), just
// reachable from the email-invite form for a site manager or location
// manager: an editor with a site-wide (location_id IS NULL) or
// location-specific scope row.
import { execute, queryFirst } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const invitationId = String(getRouterParam(event, 'invitationId') || '').trim()
  if (!invitationId) return jsonResponse({ error: 'Invitation id is required' }, { status: 400 })

  const { db, organization } = await getDashboardContext(event, { requireSite: false })

  if (!isOrganizationWideRole(organization.role)) {
    return jsonResponse({ error: 'Only owners and admins can assign invitation scope' }, { status: 403 })
  }

  const body = await readBody(event).catch(() => null) as { siteId?: unknown; locationId?: unknown } | null
  const siteId = typeof body?.siteId === 'string' ? body.siteId.trim() : ''
  const locationId = typeof body?.locationId === 'string' && body.locationId.trim() ? body.locationId.trim() : null
  if (!siteId) return jsonResponse({ error: 'siteId is required' }, { status: 400 })

  const invitation = await queryFirst<{ id: string; role: string | null; status: string }>(db, `
    SELECT id, role, status FROM invitation WHERE id = ? AND organizationId = ? LIMIT 1
  `, [invitationId, organization.id])
  if (!invitation) return jsonResponse({ error: 'Invitation not found' }, { status: 404 })
  if (invitation.status !== 'pending') return jsonResponse({ error: `Invitation is already ${invitation.status}` }, { status: 410 })
  if (invitation.role !== 'editor') return jsonResponse({ error: 'Only editor invitations can carry a site/location scope' }, { status: 400 })

  const site = await queryFirst<{ id: string }>(db, `
    SELECT id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
  `, [siteId, organization.id])
  if (!site) return jsonResponse({ error: 'siteId must reference a site in this organization' }, { status: 400 })

  if (locationId) {
    const location = await queryFirst<{ id: string }>(db, `
      SELECT id FROM business_locations WHERE id = ? AND site_id = ? AND organization_id = ? LIMIT 1
    `, [locationId, siteId, organization.id])
    if (!location) return jsonResponse({ error: 'locationId must reference a location on that site' }, { status: 400 })
  }

  await execute(db, `
    INSERT OR IGNORE INTO invitation_access_scope
      (id, invitation_id, organization_id, site_id, location_id, grant_source, created_at)
    VALUES (?, ?, ?, ?, ?, 'manual', ?)
  `, [crypto.randomUUID(), invitationId, organization.id, siteId, locationId, new Date().toISOString()])

  return jsonResponse({ success: true })
})
