import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { assertSiteLanguageEntitlement } from '~/server/utils/localization'
import { getSiteLocalizationProgress } from '~/server/utils/site-localization-opportunities'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locale = getRouterParam(event, 'locale')
  if (!organizationId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site ID and locale are required' })
  const { env, db, organization } = await requireOrganizationAccess(event, organizationId)
  const entitlement = await assertSiteLanguageEntitlement(env, db, organization.id, organizationId, locale)
  if (entitlement.source) throw createError({ statusCode: 422, statusMessage: 'Choose an additional language' })
  return await getSiteLocalizationProgress(db, { organizationId: organization.id, locale: entitlement.locale })
})
