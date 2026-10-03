import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'

import { syncCalendarOrganization } from '~/server/utils/google-calendar'
import { requireOrganizationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'organizationId')
  if (!id) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })
  const { env, organization } = await requireOrganizationAccess(event, id)
  // Explicit retry also retries failed cleanup without changing its identity.
  const { execute } = await import('~/server/db')
  await execute(env.DB, 'UPDATE google_calendar_event_links SET next_attempt_at=NULL WHERE organization_id=?', [organization.id])
  return jsonResponse({ success: true, ...await syncCalendarOrganization(env, organization.id) })
})
