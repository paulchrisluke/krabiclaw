import { defineHandler } from 'nitro'
import { getRouterParam, readBody } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { parseMerchantCommand } from '~/server/domain/merchant-handoff/contract'
import { requireMerchantHandoffCaller } from '~/server/utils/merchant-handoff-auth'
import { executeMerchantHandoffCommand, merchantHandoffHttpError } from '~/server/utils/merchant-handoff'

export default defineHandler(async (event) => {
  const orderId = getRouterParam(event, 'orderId')
  if (!orderId) return jsonResponse({ error: { code: 'invalid_request', message: 'Order ID is required' } }, { status: 400 })
  const { user } = await requireMerchantHandoffCaller(event, orderId)
  try {
    const command = parseMerchantCommand(await readBody<unknown>(event))
    if (command.resource.id !== orderId) {
      return jsonResponse({ error: { code: 'resource_mismatch', message: 'Command resource ID must match the route order ID' } }, { status: 409 })
    }
    const outcome = await executeMerchantHandoffCommand(user.db, command)
    if (!outcome.ok) return jsonResponse({ error: { code: outcome.code, message: outcome.message }, command_id: outcome.command_id, replayed: outcome.replayed, merchant: outcome.merchant }, { status: 409 })
    return jsonResponse(outcome)
  } catch (error) {
    const mapped = merchantHandoffHttpError(error)
    return jsonResponse({ error: { code: mapped.code, message: mapped.message } }, { status: mapped.statusCode })
  }
})
