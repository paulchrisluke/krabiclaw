// GET /api/public/docs - List published platform docs
import { apiErrorResponse, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listPlatformDocs } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return apiErrorResponse(event, 503, 'DATABASE_UNAVAILABLE', 'Documentation data is temporarily unavailable')

  try {
    return jsonResponse({ docs: await listPlatformDocs(db, 'published') })
  } catch (error) {
    console.error('Failed to fetch docs:', error)
    return apiErrorResponse(event, 503, 'DOCS_UNAVAILABLE', 'Documentation data is temporarily unavailable')
  }
})
import { defineEventHandler } from 'h3'
