import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireOrganizationAccess } from '~/server/utils/location-access'
import { deleteDisabledSiteLanguageContent } from '~/server/utils/site-languages'
import { isDemoOrg } from '~/server/utils/demo'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locale = getRouterParam(event, 'locale')
  if (!organizationId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site ID and locale are required' })
  const { env, db, organization } = await requireOrganizationAccess(event, organizationId)
  if (isDemoOrg(organization.id) && !(await hasPlatformEventPermission(event, env, { platform: ['access'] }))) {
    throw createError({ statusCode: 403, statusMessage: 'Demo site is read-only' })
  }
  return await deleteDisabledSiteLanguageContent(db, { organizationId: organization.id, locale })
})
