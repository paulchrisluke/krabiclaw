import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { getProductCatalogLocalization } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locale = getRouterParam(event, 'locale')
  if (!organizationId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site and locale are required' })
  const { env, db, site } = await requireSiteAccess(event, organizationId)
  return await getProductCatalogLocalization(env, db, site.organization_id, organizationId, locale)
})
