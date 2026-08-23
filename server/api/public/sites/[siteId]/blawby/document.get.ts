import { apiErrorResponse, jsonResponse } from '~/server/utils/api-response'
import { loadPublicBlawbyDocument } from '~/server/utils/public-blawby-document'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'
import { BLAWBY_ROUTE_RECIPES, type BlawbyRouteRecipe } from '~/types/blawby'

const RECIPES = new Set(BLAWBY_ROUTE_RECIPES)

export default defineHandler(async (event) => {
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

  try {
    const document = await loadPublicBlawbyDocument(event, siteId, recipe, { slug })
    return jsonResponse(finalizeRequestMetrics(event, 'public-blawby-document', document))
  } catch (error) {
    const typedError = error as {
      statusCode?: unknown
      statusMessage?: unknown
      data?: { code?: unknown }
    }
    const statusCode = typeof typedError.statusCode === 'number' ? typedError.statusCode : 500
    const code = typeof typedError.data?.code === 'string' ? typedError.data.code : 'BLAWBY_DOCUMENT_FAILED'
    const message = typeof typedError.statusMessage === 'string' ? typedError.statusMessage : 'Blawby document lookup failed'
    return apiErrorResponse(event, statusCode, code, message)
  }
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { getRouterParam } from 'nitro/h3';
