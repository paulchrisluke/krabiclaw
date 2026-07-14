// Lightweight guest/operator signal for client-side routing (pages/dashboard/index.vue),
// mirroring the server-side check in server/api/post-login.get.ts for users who
// navigate to /dashboard directly instead of arriving through /api/post-login.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { userHasLinkedCustomers } from '~/server/utils/guest-claims'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ isGuest: false })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ isGuest: false })

  const isGuest = await userHasLinkedCustomers(db, session.user.id).catch(() => false)
  return jsonResponse({ isGuest })
})
