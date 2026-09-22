import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { getProductCatalogLocalization } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locale = getRouterParam(event, 'locale')
  if (!siteId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site and locale are required' })
  const { env, db, site } = await requireSiteAccess(event, siteId)
  return await getProductCatalogLocalization(env, db, site.organization_id, siteId, locale)
})
