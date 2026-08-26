// GET /api/public/docs/[category]/[slug] - Get single published doc, scoped to its category
import { apiErrorResponse, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedPlatformDoc } from '~/server/utils/platform-content'
import { slugToCategory } from '~/utils/docs-categories'

export default defineHandler(async (event) => {
  const categorySlug = getRouterParam(event, 'category')
  const slug = getRouterParam(event, 'slug')
  if (!categorySlug || !slug) return apiErrorResponse(event, 400, 'DOC_PARAMS_REQUIRED', 'Documentation category and slug are required')

  const category = slugToCategory(categorySlug)
  if (!category) return apiErrorResponse(event, 404, 'DOC_NOT_FOUND', 'Documentation not found')

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return apiErrorResponse(event, 503, 'DATABASE_UNAVAILABLE', 'Documentation data is temporarily unavailable')

  try {
    const doc = await getPublishedPlatformDoc(db, category, slug, env)
    if (!doc) return apiErrorResponse(event, 404, 'DOC_NOT_FOUND', 'Documentation not found')

    return jsonResponse({ doc })
  } catch (error) {
    console.error('Failed to fetch doc:', error)
    return apiErrorResponse(event, 503, 'DOC_UNAVAILABLE', 'Documentation data is temporarily unavailable')
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
