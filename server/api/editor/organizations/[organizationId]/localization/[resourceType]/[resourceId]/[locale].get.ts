import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { getLocalizationForAuthoring } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const resourceType = getRouterParam(event, 'resourceType')
  const resourceId = getRouterParam(event, 'resourceId')
  const locale = getRouterParam(event, 'locale')
  if (!organizationId || !resourceType || !resourceId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site, resource, and locale route parameters are required' })
  const { env, db, site } = await requireSiteAccess(event, organizationId)
  return { localization: await getLocalizationForAuthoring(env, db, site.organization_id, organizationId, resourceType, resourceId, locale) }
})
