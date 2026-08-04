import { apiErrorResponse, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { resolvePublicBlawbyCriticalHomeOrThrow } from '~/server/utils/professional-services'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return apiErrorResponse(event, 400, 'BLAWBY_SITE_REQUIRED', 'Site ID required')

  const db = cloudflareEnv(event).db
  if (!db) return apiErrorResponse(event, 503, 'DATABASE_UNAVAILABLE', 'Database unavailable')

  try {
    return jsonResponse(await resolvePublicBlawbyCriticalHomeOrThrow(db, siteId))
  } catch (error) {
    const typedError = error as {
      statusCode?: unknown
      statusMessage?: unknown
      data?: { code?: unknown }
    }
    const statusCode = typeof typedError.statusCode === 'number' ? typedError.statusCode : 500
    const code = typeof typedError.data?.code === 'string' ? typedError.data.code : 'BLAWBY_CRITICAL_FAILED'
    const message = typeof typedError.statusMessage === 'string' ? typedError.statusMessage : 'Blawby critical data lookup failed'
    return apiErrorResponse(event, statusCode, code, message)
  }
})
