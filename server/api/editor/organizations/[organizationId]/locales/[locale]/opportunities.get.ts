import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { assertOrganizationLanguageEntitlement } from '~/server/utils/localization'
import { getOrganizationLocalizationProgress } from '~/server/utils/organization-localization-opportunities'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locale = getRouterParam(event, 'locale')
  if (!organizationId || !locale) throw createError({ statusCode: 400, statusMessage: 'Organization ID and locale are required' })
  const { env, db, organization } = await requireOrganizationAccess(event, organizationId)
  const entitlement = await assertOrganizationLanguageEntitlement(env, db, organization.id, locale)
  if (entitlement.source) throw createError({ statusCode: 422, statusMessage: 'Choose an additional language' })
  return await getOrganizationLocalizationProgress(db, { organizationId: organization.id, locale: entitlement.locale })
})
