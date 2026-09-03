import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import type { InventoryReference } from '~/shared/inventory'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { applyInventoryMovement } from '~/server/utils/inventory'
import { requireLocationAccess } from '~/server/utils/location-access'

interface MovementBody {
  product_id: string
  movement_type: 'restock' | 'waste' | 'manual_adjustment'
  quantity: number
  idempotency_key: string
  reference?: InventoryReference
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, site, session } = await requireLocationAccess(event, siteId, locationId)
    const body = await readRequiredBody<MovementBody>(event)
    if (!['restock', 'waste', 'manual_adjustment'].includes(body.movement_type)) {
      return jsonResponse({ error: 'Unsupported dashboard inventory movement' }, { status: 400 })
    }
    const movement = await applyInventoryMovement(db, {
      organizationId: site.organization_id, siteId, locationId, productId: body.product_id,
    }, {
      movement_type: body.movement_type, quantity: body.quantity, idempotency_key: body.idempotency_key, reference: body.reference,
    }, { type: 'user', id: session.user.id })
    return jsonResponse({ success: true, movement })
  } catch (error) {
    rethrowHttpError(error)
    console.error('inventory_movement_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to record inventory movement' }, { status: 500 })
  }
})
