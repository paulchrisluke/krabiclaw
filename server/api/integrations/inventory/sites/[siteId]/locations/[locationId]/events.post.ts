import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import type { ExternalInventoryEventInput } from '~/shared/inventory'
import { cloudflareEnv, jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { ingestExternalInventoryEvent } from '~/server/utils/inventory'
import { assertLocationAccess } from '~/server/utils/member-access'
import { requireMcpSite, requireMcpUser } from '~/server/utils/mcp-auth'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const baseUrl = cloudflareEnv(event).BETTER_AUTH_URL?.replace(/\/$/, '')
    if (!baseUrl) return jsonResponse({ error: 'Integration authentication is unavailable' }, { status: 503 })
    const user = await requireMcpUser(event, {
      audiences: [`${baseUrl}/api/integrations/inventory`],
      requiredScopes: ['inventory:write'],
      requireBearer: true,
    })
    if (!user.oauthClientId) return jsonResponse({ error: 'OAuth client identity is required' }, { status: 401 })
    const site = await requireMcpSite(event, siteId, 'editor', user)
    await assertLocationAccess(site.db, {
      env: site.env, memberId: site.memberId, role: site.role, organizationId: site.organizationId, siteId: site.siteId, locationId,
    })
    const body = await readRequiredBody<ExternalInventoryEventInput>(event)
    const result = await ingestExternalInventoryEvent(site.db, {
      organizationId: site.organizationId, siteId: site.siteId, locationId,
    }, body, { userId: site.userId, oauthClientId: user.oauthClientId })
    return jsonResponse({ success: true, ...result })
  } catch (error) {
    rethrowHttpError(error)
    console.error('external_inventory_event_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to accept inventory event' }, { status: 500 })
  }
})
