import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { deleteResourceLocalization } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const resourceType = getRouterParam(event, 'resourceType')
  const resourceId = getRouterParam(event, 'resourceId')
  const locale = getRouterParam(event, 'locale')
  if (!siteId || !resourceType || !resourceId || !locale) throw createError({ statusCode: 400, statusMessage: 'Complete localization route is required' })
  const { db, site } = await requireSiteAccess(event, siteId)
  return await deleteResourceLocalization(db, { organizationId: site.organization_id, siteId, resourceType, resourceId, locale })
})
