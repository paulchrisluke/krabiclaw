// PATCH /api/editor/sites/[siteId]/reviews/[reviewId]
// Allows owners to set owner_reply, change status (approve/hide)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reviewId = getRouterParam(event, 'reviewId')
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(
    `SELECT s.organization_id FROM sites s JOIN member m ON s.organization_id = m.organizationId
     WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin') LIMIT 1`
  ).bind(siteId, session.user.id).first()
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  const body = await readBody(event)
  const allowed = ['owner_reply', 'owner_reply_at', 'status']
  const sets = ['updated_at = ?']
  const params: ApiRecord[] = [new Date().toISOString()]
  for (const key of allowed) {
    if (key in body) { sets.push(`${key} = ?`); params.push(body[key] ?? null) }
  }
  if (body.owner_reply !== undefined && !('owner_reply_at' in body)) {
    sets.push('owner_reply_at = ?')
    params.push(body.owner_reply ? new Date().toISOString() : null)
  }
  params.push(reviewId, siteId)

  await db.prepare(
    `UPDATE reviews SET ${sets.join(', ')} WHERE id = ? AND site_id = ?`
  ).bind(...params).run()

  return jsonResponse({ updated: true })
})
