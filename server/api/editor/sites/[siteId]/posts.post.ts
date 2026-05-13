import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createPost } from '~/server/utils/post-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event)
  if (!body?.body?.trim()) return jsonResponse({ error: 'Post body is required' }, { status: 400 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `).bind(siteId, session.user.id).first()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const post = await createPost(db, site.organization_id, siteId, {
    title: body.title?.trim() || undefined,
    body: body.body.trim(),
    image_asset_id: body.image_asset_id || undefined,
    scheduled_for: body.scheduled_for || undefined,
    location_id: body.location_id || undefined,
    post_type: body.post_type || undefined,
    cta_type: body.cta_type || undefined,
    cta_url: body.cta_url || undefined,
    event_title: body.event_title || undefined,
    event_start: body.event_start || undefined,
    event_end: body.event_end || undefined,
    offer_coupon: body.offer_coupon || undefined,
    offer_terms: body.offer_terms || undefined,
  }, session.user.id)

  return jsonResponse({ success: true, post }, { status: 201 })
})
