// Auth guard for the guest/end-customer surface (pages/account/**) — any signed-in
// user, no organization membership required. Distinct from
// server/api/admin/access.get.ts, which additionally requires platform-admin role.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)

  if (!session?.user) {
    return jsonResponse({ allowed: false }, { status: 401 })
  }

  return jsonResponse({ allowed: true })
})
