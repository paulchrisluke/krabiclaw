import { jsonResponse } from '~/server/utils/api-response'
import { deleteSlotOverride, getExperienceById } from '~/server/utils/experiences'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  const overrideId = getRouterParam(event, 'overrideId')
  if (!siteId || !experienceId || !overrideId) {
    return jsonResponse({ error: 'siteId, experienceId and overrideId required' }, { status: 400 })
  }

  const { db, site } = await requireSiteAccess(event, siteId, 'context')
  const experience = await getExperienceById(db, siteId, experienceId)
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: experience.location_id,
  })

  const deleted = await deleteSlotOverride(db, siteId, experienceId, overrideId)
  if (!deleted) return jsonResponse({ error: 'Override not found' }, { status: 404 })

  return jsonResponse({ deleted: true })
})
