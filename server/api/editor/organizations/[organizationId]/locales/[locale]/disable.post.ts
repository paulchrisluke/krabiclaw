import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { disableSiteLanguage } from '~/server/utils/site-languages'
import { isDemoOrg } from '~/server/utils/demo'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locale = getRouterParam(event, 'locale')
  if (!organizationId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site ID and locale are required' })
  const { env, db, site } = await requireSiteAccess(event, organizationId)
  if (isDemoOrg(site.organization_id) && !(await hasPlatformEventPermission(event, env, { platform: ['access'] }))) {
    throw createError({ statusCode: 403, statusMessage: 'Demo site is read-only' })
  }
  return { language: await disableSiteLanguage(db, { organizationId: site.organization_id, locale }) }
})
