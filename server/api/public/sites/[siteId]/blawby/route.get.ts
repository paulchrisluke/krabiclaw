import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublicBlawbyRouteData } from '~/server/utils/professional-services'
import type { BlawbyRouteRecipe } from '~/types/blawby'
import { siteSupportsBlawbyTemplate } from '~/utils/template-registry'

const RECIPES = new Set<BlawbyRouteRecipe>([
  'home',
  'services',
  'offering',
  'about',
  'pricing',
  'contact',
  'schedule',
  'blog',
  'article',
  'donate',
  'privacy',
  'terms',
  'third-party-notices',
])

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const query = getQuery(event)
  const recipe = typeof query.recipe === 'string' ? query.recipe as BlawbyRouteRecipe : null
  const slug = typeof query.slug === 'string' ? query.slug : null
  if (!siteId || !recipe || !RECIPES.has(recipe)) {
    return jsonResponse({ error: 'Valid siteId and Blawby route recipe required' }, { status: 400 })
  }
  if (recipe === 'offering' && !slug) {
    return jsonResponse({ error: 'Offering slug required' }, { status: 400 })
  }
  if (recipe === 'article' && !slug) {
    return jsonResponse({ error: 'Article slug required' }, { status: 400 })
  }

  const db = cloudflareEnv(event).db
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
  const site = await queryFirst<{ vertical: string; theme_id: string }>(db, `
    SELECT vertical, theme_id
      FROM sites
     WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
     LIMIT 1
  `, [siteId])
  if (!siteSupportsBlawbyTemplate({ vertical: site?.vertical, themeId: site?.theme_id })) {
    return jsonResponse({ error: 'Blawby is not enabled for this site' }, { status: 404 })
  }

  const route = await getPublicBlawbyRouteData(db, siteId, recipe, { slug })
  if ((recipe === 'offering' && !route.offering) || (recipe === 'article' && !route.post) || (!['offering', 'article'].includes(recipe) && !route.page)) {
    return jsonResponse({ error: 'Route content not found' }, { status: 404 })
  }
  return jsonResponse({ success: true, ...route })
})
