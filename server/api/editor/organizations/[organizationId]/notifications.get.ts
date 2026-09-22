import { jsonResponse } from '~/server/utils/api-response'
import { getNotificationsSettings } from '~/server/utils/mcp-workflows'
import { requireOrganizationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })

  const { db, organization } = await requireOrganizationAccess(event, organizationId)

  const notifications = await getNotificationsSettings(db, organization.id, organizationId)
  return jsonResponse({ success: true, notifications })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
