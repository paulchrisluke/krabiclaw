import { apiErrorResponse, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublicBlawbyDocumentData, hasPublicBlawbyRouteContent } from '~/server/utils/professional-services'
import type { BlawbyRouteRecipe } from '~/types/blawby'

const RECIPES = new Set<BlawbyRouteRecipe>([
  'home', 'services', 'offering', 'about', 'pricing', 'contact', 'schedule',
  'blog', 'article', 'donate', 'privacy', 'terms', 'third-party-notices',
])

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const query = getQuery(event)
  const recipe = typeof query.recipe === 'string' ? query.recipe as BlawbyRouteRecipe : null
  const slug = typeof query.slug === 'string' ? query.slug : null
  if (!siteId || !recipe || !RECIPES.has(recipe)) {
    return apiErrorResponse(event, 400, 'BLAWBY_DOCUMENT_REQUIRED', 'Valid site ID and Blawby route recipe required')
  }
  if ((recipe === 'offering' || recipe === 'article') && !slug) {
    return apiErrorResponse(event, 400, 'BLAWBY_DOCUMENT_SLUG_REQUIRED', 'Route slug required')
  }

  const db = cloudflareEnv(event).db
  if (!db) return apiErrorResponse(event, 503, 'DATABASE_UNAVAILABLE', 'Database unavailable')

  const document = await getPublicBlawbyDocumentData(db, siteId, recipe, { slug })
  if (!document) return apiErrorResponse(event, 404, 'BLAWBY_NOT_ENABLED', 'Blawby is not enabled for this site')
  if (!hasPublicBlawbyRouteContent(document.route)) {
    return apiErrorResponse(event, 404, 'BLAWBY_ROUTE_NOT_FOUND', 'Route content not found')
  }
  return jsonResponse({ success: true, ...document })
})
