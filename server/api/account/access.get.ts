// Auth guard for the guest/end-customer surface (pages/account/**) — any signed-in
// user, no organization membership required. Distinct from
// server/api/admin/access.get.ts, which additionally requires platform-admin role.
import { jsonResponse } from '~/server/utils/api-response'
import { resolveAccountAccessForEvent } from '~/server/utils/route-access'

export default defineEventHandler(async (event) => {
  const result = await resolveAccountAccessForEvent(event)
  if (result.status === 'unauthenticated') return jsonResponse({ allowed: false }, { status: 401 })
  return jsonResponse({ allowed: result.allowed })
})
