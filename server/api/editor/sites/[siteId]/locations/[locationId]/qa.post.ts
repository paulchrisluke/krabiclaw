// POST /api/editor/sites/[siteId]/locations/[locationId]/qa
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event)
  const { question, answer, question_author, is_owner_answer = 1, sort_order = 0 } = body
  if (!question) return jsonResponse({ error: 'question required' }, { status: 400 })

  const site = await db.prepare(`SELECT organization_id FROM sites WHERE id = ? LIMIT 1`).bind(siteId).first()
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.prepare(
    `INSERT INTO location_qa (id, organization_id, site_id, location_id, question, question_author, answer, is_owner_answer, source, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)`
  ).bind(id, site.organization_id, siteId, locationId, question, question_author ?? null, answer ?? null, is_owner_answer ? 1 : 0, sort_order, now, now).run()

  return jsonResponse({ id, created: true })
})
