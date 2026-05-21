// PATCH /api/editor/sites/[siteId]/locations/[locationId]/qa/[id]
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const qaId = getRouterParam(event, 'id')
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event)
  const allowed = ['question', 'answer', 'question_author', 'is_owner_answer', 'status', 'sort_order']
  const sets: string[] = ['updated_at = ?']
  const params: ApiRecord[] = [new Date().toISOString()]

  for (const key of allowed) {
    if (key in body) { sets.push(`${key} = ?`); params.push(body[key]) }
  }
  params.push(qaId, locationId, siteId)

  await db.prepare(
    `UPDATE location_qa SET ${sets.join(', ')} WHERE id = ? AND location_id = ? AND site_id = ?`
  ).bind(...params).run()

  return jsonResponse({ updated: true })
})
