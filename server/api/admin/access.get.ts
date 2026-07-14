import { jsonResponse } from '~/server/utils/api-response'
import { resolveAdminAccessForEvent } from '~/server/utils/route-access'

export default defineEventHandler(async (event) => {
  const result = await resolveAdminAccessForEvent(event)
  if (result.status === 'unauthenticated') return jsonResponse({ allowed: false }, { status: 401 })
  return jsonResponse({ allowed: result.allowed })
})
