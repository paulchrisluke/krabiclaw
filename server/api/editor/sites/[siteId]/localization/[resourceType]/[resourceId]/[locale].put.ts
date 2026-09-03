import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { readRequiredBody } from '~/server/utils/api-response'
import { putResourceLocalizationForAuthoring } from '~/server/utils/localization'
import { isDemoOrg } from '~/server/utils/demo'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const resourceType = getRouterParam(event, 'resourceType')
  const resourceId = getRouterParam(event, 'resourceId')
  const locale = getRouterParam(event, 'locale')
  if (!siteId || !resourceType || !resourceId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site, resource, and locale route parameters are required' })
  const { env, db, session, site } = await requireSiteAccess(event, siteId)
  if (isDemoOrg(site.organization_id) && !(await hasPlatformEventPermission(event, env, { platform: ['access'] }))) {
    throw createError({ statusCode: 403, statusMessage: 'Demo site is read-only' })
  }
  const body = await readRequiredBody<{ values?: unknown; route_path?: unknown; content_blocks?: unknown; expected_document_updated_at?: unknown }>(event)
  return { localization: await putResourceLocalizationForAuthoring(db, {
    organizationId: site.organization_id,
    siteId,
    resourceType,
    resourceId,
    locale,
    values: body.values,
    routePath: body.route_path,
    contentBlocks: body.content_blocks,
    expectedDocumentUpdatedAt: body.expected_document_updated_at,
    userId: session.user.id,
  }) }
})
