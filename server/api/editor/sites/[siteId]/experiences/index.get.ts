import { jsonResponse } from '~/server/utils/api-response'
import { listExperiences } from '~/server/utils/experiences'
import { listAccessibleLocationIds } from '~/server/utils/member-access'
import { loadDashboardLocationExperiences } from '~/server/utils/dashboard-editor-resources'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')

  const query = getQuery(event)
  const locationId = typeof query.location_id === 'string' && query.location_id ? query.location_id : null
  if (locationId) {
    return jsonResponse(await loadDashboardLocationExperiences(event, siteId, locationId))
  }

  // A location-scoped editor sees only experiences at their own location(s), // rather than every experience across the whole site — null means
  // unrestricted (org-wide role, or a site-wide-scoped editor).
  const accessibleLocationIds = await listAccessibleLocationIds(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, })
  const experiences = (await listExperiences(db, siteId))
    .filter(experience => accessibleLocationIds === null || accessibleLocationIds.includes(experience.location_id))
  return jsonResponse({ experiences })
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
