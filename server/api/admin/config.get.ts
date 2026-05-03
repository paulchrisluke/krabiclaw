import { toWebRequest } from 'h3'
import { isAdminRequest } from '../../utils/admin-auth'
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getConfig } from '../../utils/site-config'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!(await isAdminRequest(toWebRequest(event), env))) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!env.REVIEWS_DB) throw createError({ statusCode: 503, message: 'Database unavailable' })
  const config = await getConfig(env.REVIEWS_DB)
  return jsonResponse({ config })
})
