import { defineHandler, HTTPError } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicDraftBlawbyDocument } from '~/server/utils/public-draft-bootstrap'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'
import { BLAWBY_ROUTE_RECIPES, type BlawbyRouteRecipe } from '~/types/blawby'

const RECIPES = new Set(BLAWBY_ROUTE_RECIPES)

export default defineHandler(async (event) => {
  const draftId = String(getRouterParam(event, 'draftId') || '').trim()
  const query = getQuery(event)
  const recipe = typeof query.recipe === 'string' ? query.recipe as BlawbyRouteRecipe : null
  if (!draftId || !recipe || !RECIPES.has(recipe)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Valid draft ID and Blawby route recipe required' })
  }
  const token = typeof query.token === 'string' ? query.token : undefined
  const payload = await loadPublicDraftBlawbyDocument(event, draftId, token, recipe)
  return jsonResponse(finalizeRequestMetrics(event, 'public-draft-blawby-document', payload))
})
