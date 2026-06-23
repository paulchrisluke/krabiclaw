// GET /api/public/sites/[siteId]/locations/[slug]/qa
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const location = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM business_locations WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`,
    [siteId, slug],
  )
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  const results = await queryAll(
    db,
    `SELECT id, question, question_author, question_date,
            answer, answer_author, answer_date, is_owner_answer, upvote_count
     FROM location_qa
     WHERE location_id = ? AND status = 'published'
     ORDER BY is_owner_answer DESC, upvote_count DESC, sort_order, created_at`
    ,
    [location.id],
  )

  return jsonResponse({ qa: results ?? [] })
})
