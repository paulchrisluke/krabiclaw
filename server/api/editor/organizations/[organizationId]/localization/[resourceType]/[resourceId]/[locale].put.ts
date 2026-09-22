import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { requireSiteAccess } from '~/server/utils/location-access'
import { readRequiredBody } from '~/server/utils/api-response'
import { putLocalizationForAuthoring } from '~/server/utils/localization'
import { isDemoOrg } from '~/server/utils/demo'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const resourceType = getRouterParam(event, 'resourceType')
  const resourceId = getRouterParam(event, 'resourceId')
  const locale = getRouterParam(event, 'locale')
  if (!organizationId || !resourceType || !resourceId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site, resource, and locale route parameters are required' })
  const { env, db, session, site } = await requireSiteAccess(event, organizationId)
  if (isDemoOrg(site.organization_id) && !(await hasPlatformEventPermission(event, env, { platform: ['access'] }))) {
    throw createError({ statusCode: 403, statusMessage: 'Demo site is read-only' })
  }
  const body = await readRequiredBody<{ values?: unknown; route_path?: unknown; content_blocks?: unknown; expected_updated_at?: unknown }>(event)
  return { localization: await putLocalizationForAuthoring(env, db, {
    organizationId: site.organization_id,
    resourceType,
    resourceId,
    locale,
    values: body.values,
    routePath: body.route_path,
    contentBlocks: body.content_blocks,
    expectedUpdatedAt: body.expected_updated_at,
    userId: session.user.id,
  }) }
})
