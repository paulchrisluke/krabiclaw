// GET /api/public/sites/[siteId]/locations/[slug]/qa
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const location = await queryFirst<{ id: string }>(
    db, `SELECT id FROM business_locations WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`, [siteId, slug], )
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  const results = await queryAll(
    db, `SELECT id, title AS question, summary AS answer, (metadata_json ->> '$.question_author') AS question_author, (metadata_json ->> '$.question_date') AS question_date, (metadata_json ->> '$.answer_author') AS answer_author, (metadata_json ->> '$.answer_date') AS answer_date, (metadata_json ->> '$.is_owner_answer') AS is_owner_answer, (metadata_json ->> '$.upvote_count') AS upvote_count
     FROM content_documents
     WHERE kind = 'qa' AND row_role = 'root' AND location_id = ? AND status = 'published'
     ORDER BY is_owner_answer DESC, upvote_count DESC, sort_order, created_at`, [location.id], )

  return jsonResponse({ qa: results ?? [] })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
