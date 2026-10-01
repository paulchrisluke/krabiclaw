import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { setProductBookingConfig } from '~/server/utils/availability'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const productId = getRouterParam(event, 'productId')
  if (!organizationId || !productId) return jsonResponse({ error: 'Organization ID and product ID are required' }, { status: 400 })
  try {
    const { db, session, organization } = await requireOrganizationAccess(event, organizationId)
    const body = await readStrictBody<{ duration_minutes?: unknown; default_capacity?: unknown }>(event, { duration_minutes: 'unknown', default_capacity: 'unknown' })
    await setProductBookingConfig(db, { organizationId: organization.id, productId, actorId: session.user.id, patch: body })
    return jsonResponse({ success: true, product_id: productId })
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: 'Failed to set booking configuration' }, { status: 500 })
  }
})
