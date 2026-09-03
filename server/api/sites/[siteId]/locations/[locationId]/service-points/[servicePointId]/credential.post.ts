import { issueServicePointCredential } from '~/server/domain/service-points'
import { jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { resolveSitePublicOrigin } from '~/server/utils/mcp-executor/shared'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const servicePointId = getRouterParam(event, 'servicePointId')
  if (!siteId || !locationId || !servicePointId) {
    return jsonResponse({ error: 'Site ID, location ID, and service point ID are required' }, { status: 400 })
  }

  const body = await readStrictBody<{ mode: string }>(event, { mode: 'string' })
  if (body.mode !== 'provision' && body.mode !== 'rotate') {
    return jsonResponse({ error: 'Credential mode must be provision or rotate' }, { status: 400 })
  }
  const { db, env, session, site } = await requireLocationAccess(event, siteId, locationId)
  const publicOrigin = resolveSitePublicOrigin({
    publicUrl: site.public_url,
    customDomain: null,
    subdomain: site.subdomain,
  }, env)
  if (!publicOrigin) {
    return jsonResponse({ error: 'Site public URL is unavailable' }, { status: 503 })
  }
  const result = await issueServicePointCredential(db, {
    organizationId: site.organization_id,
    siteId,
    locationId,
  }, servicePointId, session.user.id, body.mode)
  const orderingUrl = new URL('/ordering', publicOrigin)
  orderingUrl.hash = new URLSearchParams({ credential: result.credential }).toString()
  return jsonResponse({
    service_point: result.servicePoint,
    ordering_qr: {
      credential: result.credential,
      credential_id: result.credentialId,
      version: result.version,
      ordering_url: orderingUrl.toString(),
    },
  }, { status: 201 })
})
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
