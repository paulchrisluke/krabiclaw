import { jsonResponse } from '~/server/utils/api-response'
import { getExperienceById, listSlotOverrides } from '~/server/utils/experiences'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

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

  const query = getQuery(event)
  const fromDate = typeof query.from === 'string' ? query.from : undefined
  const toDate = typeof query.to === 'string' ? query.to : undefined

  const overrides = await listSlotOverrides(db, siteId, experienceId, { fromDate, toDate })
  return jsonResponse({ overrides })
})
