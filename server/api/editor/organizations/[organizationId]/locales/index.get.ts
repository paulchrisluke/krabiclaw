import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { getSiteLanguageSettings } from '~/server/utils/site-languages'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) throw createError({ statusCode: 400, statusMessage: 'Organization ID required' })
  const { env, db, site } = await requireSiteAccess(event, organizationId)
  return await getSiteLanguageSettings(db, env, { organizationId: site.organization_id })
})
