import { toWebRequest } from 'h3'
import { readAdminSession } from '../../utils/admin-auth'
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'

export default defineEventHandler(async (event) => {
  const session = await readAdminSession(toWebRequest(event), cloudflareEnv(event))
  return jsonResponse({
    authenticated: Boolean(session),
    email: session?.email ?? null
  })
})
