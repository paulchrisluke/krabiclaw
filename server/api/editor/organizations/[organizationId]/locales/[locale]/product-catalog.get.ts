import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireOrganizationAccess } from '~/server/utils/location-access'
import { getProductCatalogLocalization } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locale = getRouterParam(event, 'locale')
  if (!organizationId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site and locale are required' })
  const { env, db, organization } = await requireOrganizationAccess(event, organizationId)
  return await getProductCatalogLocalization(env, db, organization.id, organizationId, locale)
})
