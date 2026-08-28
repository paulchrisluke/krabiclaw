import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { getSiteLanguageSettings } from '~/server/utils/site-language-billing'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID required' })
  const { env, db, site } = await requireSiteAccess(event, siteId)
  return await getSiteLanguageSettings(db, env, { organizationId: site.organization_id, siteId })
})
