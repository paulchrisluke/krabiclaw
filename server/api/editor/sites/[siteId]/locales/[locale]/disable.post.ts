import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { disableSiteLanguageLicense } from '~/server/utils/site-language-billing'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locale = getRouterParam(event, 'locale')
  if (!siteId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site ID and locale are required' })
  const { env, db, site } = await requireSiteAccess(event, siteId)
  return { license: await disableSiteLanguageLicense(db, env, { organizationId: site.organization_id, siteId, locale }) }
})
