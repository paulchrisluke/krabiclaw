import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { enableSiteLanguageLicense } from '~/server/utils/site-language-billing'
import { readRequiredBody } from '~/server/utils/api-response'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locale = getRouterParam(event, 'locale')
  if (!siteId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site ID and locale are required' })
  const { env, db, site } = await requireSiteAccess(event, siteId)
  const body = await readRequiredBody<{ label?: unknown }>(event)
  if (typeof body.label !== 'string' || !body.label.trim()) throw createError({ statusCode: 422, statusMessage: 'label is required' })
  return { license: await enableSiteLanguageLicense(db, env, { organizationId: site.organization_id, siteId, locale, label: body.label }) }
})
