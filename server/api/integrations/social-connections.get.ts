import { defineHandler } from 'nitro'
import { getQuery } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { requireRequestedLocationAccess, requireRequestedOrganizationWideAccess } from '~/server/utils/location-access'
import { dashboardOrigin } from '~/server/utils/dashboard-notification-links'
import { findOrganizationById } from '~/server/utils/member-access'
import { getSocialConnections } from '~/server/utils/social-publication'

/**
 * Where a post can be published: the same answer get_social_connections gives
 * an MCP client — targets and revisions, never a token — readable with the
 * post's location access.
 */
export default defineHandler(async (event) => {
  const query = getQuery(event) as { organizationId?: string; locationId?: string }
  const { env, organization } = query.locationId
    ? await requireRequestedLocationAccess(event, query.locationId, query.organizationId)
    : await requireRequestedOrganizationWideAccess(event, query.organizationId)
  const record = await findOrganizationById(env, organization.id)
  if (!record) return jsonResponse({ error: 'Organization not found' }, { status: 404 })
  return jsonResponse(await getSocialConnections(env, organization.id, { dashboardBase: dashboardOrigin(env, { orgSlug: record.slug, locationSlug: null }) }))
})
