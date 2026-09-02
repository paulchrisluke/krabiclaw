import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { requireMerchantHandoffCaller } from '~/server/utils/merchant-handoff-auth'
import { readMerchantHandoffOrder } from '~/server/utils/merchant-handoff'

export default defineHandler(async (event) => {
  const orderId = getRouterParam(event, 'orderId')
  if (!orderId) return jsonResponse({ error: { code: 'invalid_request', message: 'Order ID is required' } }, { status: 400 })
  const { user } = await requireMerchantHandoffCaller(event, orderId)
  const order = await readMerchantHandoffOrder(user.db, orderId)
  if (!order) return jsonResponse({ error: { code: 'order_not_found', message: 'Order not found' } }, { status: 404 })
  return jsonResponse(order)
})
