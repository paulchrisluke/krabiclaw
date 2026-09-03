import {
  createServicePoint,
  issueServicePointCredential,
  listServicePoints,
  revokeServicePointCredential,
  updateServicePoint,
} from '~/server/domain/service-points'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import type { McpExecutorContext } from './shared'
import { NOT_HANDLED, requiredString, resolveSitePublicOrigin } from './shared'

export async function handleServicePointTools(ctx: McpExecutorContext): Promise<unknown> {
  const { args, site, toolName } = ctx
  const locationId = requiredString(args, 'location_id')
  const scope = {
    organizationId: site.organizationId,
    siteId: site.siteId,
    locationId,
  }

  switch (toolName) {
    case 'list_service_points':
      return { service_points: await listServicePoints(site.db, scope) }
    case 'create_service_point': {
      const servicePoint = await createServicePoint(site.db, scope, { label: requiredString(args, 'label') }, site.userId)
      return renderStructuredResponse(
        { service_point: servicePoint },
        `Created service point "${servicePoint.label}".`,
      )
    }
    case 'update_service_point': {
      const update: { label?: unknown; status?: unknown } = {}
      if ('label' in args) update.label = args.label
      if ('status' in args) update.status = args.status
      const servicePoint = await updateServicePoint(site.db, scope, requiredString(args, 'service_point_id'), {
        ...update,
      })
      return renderStructuredResponse(
        { service_point: servicePoint },
        `Updated service point "${servicePoint.label}".`,
      )
    }
    case 'provision_service_point_qr':
    case 'rotate_service_point_qr': {
      const mode = toolName === 'rotate_service_point_qr' ? 'rotate' : 'provision'
      const result = await issueServicePointCredential(
        site.db,
        scope,
        requiredString(args, 'service_point_id'),
        site.userId,
        mode,
      )
      const origin = resolveSitePublicOrigin(site, site.env)
      if (!origin) throw new Error('Site public URL is unavailable')
      const orderingUrl = new URL('/ordering', origin)
      orderingUrl.hash = new URLSearchParams({ credential: result.credential }).toString()
      return renderStructuredResponse(
        { service_point: result.servicePoint, ordering_url: orderingUrl.toString(), version: result.version },
        `${mode === 'rotate' ? 'Rotated' : 'Provisioned'} the Ordering QR for "${result.servicePoint.label}". Save the returned URL now; it cannot be recovered later.`,
      )
    }
    case 'revoke_service_point_qr': {
      const revoked = await revokeServicePointCredential(site.db, scope, requiredString(args, 'service_point_id'))
      return renderStructuredResponse(
        { revoked },
        revoked ? 'Revoked the Ordering QR credential.' : 'The Service Point had no active Ordering QR credential.',
      )
    }
    default:
      return NOT_HANDLED
  }
}
