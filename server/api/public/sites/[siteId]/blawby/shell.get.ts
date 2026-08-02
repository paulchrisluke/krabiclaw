import { apiErrorResponse, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getActiveBlawbySite, getPublicBlawbyShellData } from '~/server/utils/professional-services'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return apiErrorResponse(event, 400, 'SITE_ID_REQUIRED', 'Site ID is required')

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return apiErrorResponse(event, 503, 'DATABASE_UNAVAILABLE', 'Database unavailable')

  const site = await getActiveBlawbySite(db, siteId)
  if (!site) {
    return apiErrorResponse(event, 404, 'BLAWBY_NOT_ENABLED', 'Blawby is not enabled for this site')
  }

  return jsonResponse({
    success: true,
    ...(await getPublicBlawbyShellData(db, siteId)),
  })
})
