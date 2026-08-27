// GET /api/dashboard/locations/[id] — Fetch a single location for the workspace page
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardLocationContext } from '~/server/utils/dashboard-context'
import { parseLocationPayload } from '~/server/utils/location-payload'
import { assertLocationAccess } from '~/server/utils/member-access'
import { resolveLocationCapabilitySummary } from '~/server/utils/location-management'

export default defineHandler(async (event) => {
  const locationId = getRouterParam(event, 'id')
  if (!locationId) return jsonResponse({ error: 'Location ID required' }, { status: 400 })

  const { env, db, organization, location } = await getDashboardLocationContext(event, locationId)
  const organizationId = organization.id
  await assertLocationAccess(db, {
    env,
    memberId: organization.memberId, role: organization.role, organizationId, siteId: location.site_id, locationId, })

  const capabilitySummary = await resolveLocationCapabilitySummary(db, organizationId, location.site_id, location.feature_overrides as string | null ?? null)

  return jsonResponse({ success: true, location: parseLocationPayload(location), ...capabilitySummary })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
