import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { PostValidationError, updatePost } from '~/server/utils/post-management'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const postId = getRouterParam(event, 'postId')
  if (!siteId || !postId) return jsonResponse({ error: 'Site ID and Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event)

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let post
  try {
    post = await updatePost(db, site.organization_id, siteId, postId, {
      title: body.title,
      body: body.body,
      image_asset_id: body.image_asset_id,
      slug: body.slug,
      seo_title: body.seo_title,
      seo_description: body.seo_description,
      og_image_asset_id: body.og_image_asset_id,
      gallery_media: body.gallery_media,
      scheduled_for: body.scheduled_for,
      location_id: body.location_id,
      post_type: body.post_type,
      cta_type: body.cta_type,
      cta_url: body.cta_url,
      event_title: body.event_title,
      event_start: body.event_start,
      event_end: body.event_end,
      offer_coupon: body.offer_coupon,
      offer_terms: body.offer_terms,
    }, session.user.id, env)
  } catch (error) {
    if (error instanceof PostValidationError) {
      return jsonResponse({ error: error.message }, { status: error.statusCode })
    }
    throw error
  }

  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  return jsonResponse({ success: true, post })
})
