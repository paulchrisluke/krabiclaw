import { jsonResponse } from '~/server/utils/api-response'
import { deleteExperience } from '~/server/utils/experiences'
import { queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId, 'context')
  const experience = await queryFirst<{ location_id: string }>(db, 'SELECT location_id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1', [experienceId, siteId])
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: experience.location_id,
  })

  const deleted = await deleteExperience(db, siteId, experienceId)
  if (!deleted) return jsonResponse({ error: 'Experience not found' }, { status: 404 })

  return jsonResponse({ deleted: true })
})
