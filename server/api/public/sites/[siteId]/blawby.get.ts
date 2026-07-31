import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getActiveBlawbySite, getPublicBlawbyData } from '~/server/utils/professional-services'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })

  const site = await getActiveBlawbySite(db, siteId)
  if (!site) return jsonResponse({ error: 'Blawby is not enabled for this site' }, { status: 404 })

  return jsonResponse({
    success: true,
    ...(await getPublicBlawbyData(db, siteId)),
  })
})
