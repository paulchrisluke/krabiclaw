import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createPost, PostValidationError } from '~/server/utils/post-management'
import { assertResourceAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event)
  if (!body?.body?.trim()) return jsonResponse({ error: 'Post body is required' }, { status: 400 })

  const site = await queryFirst<{ id: string; organization_id: string; member_id: string; member_role: string }>(db, `
    SELECT s.id, s.organization_id, m.id AS member_id, m.role AS member_role FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const targetLocationId = typeof body.location_id === 'string' && body.location_id ? body.location_id : null
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: targetLocationId,
  })

  const imageAssetId = typeof body.image_asset_id === 'string' ? body.image_asset_id.trim() : ''
  if (imageAssetId) {
    let asset: { id: string; organization_id: string } | null | undefined
    try {
      asset = await queryFirst<{ id: string; organization_id: string }>(
        db,
        `SELECT id, organization_id FROM media_assets WHERE id = ? LIMIT 1`,
        [imageAssetId],
      )
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Unknown database error')
      console.error('post_create_asset_lookup_failed', {
        imageAssetId,
        error: normalizedError.message
      })
      return jsonResponse({ error: 'Failed to validate image asset' }, { status: 500 })
    }

    if (!asset) return jsonResponse({ error: 'Invalid image asset' }, { status: 400 })
    if (asset.organization_id !== site.organization_id) return jsonResponse({ error: 'Forbidden image asset' }, { status: 403 })
  }

  let post
  try {
    post = await createPost(db, site.organization_id, siteId, {
      title: body.title?.trim() || undefined,
      body: body.body.trim(),
      image_asset_id: imageAssetId || undefined,
      slug: body.slug || undefined,
      seo_title: body.seo_title || undefined,
      seo_description: body.seo_description || undefined,
      og_image_asset_id: body.og_image_asset_id || undefined,
      gallery_media: body.gallery_media,
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
    }, session.user.id, env)
  } catch (error) {
    if (error instanceof PostValidationError) {
      return jsonResponse({ error: error.message }, { status: error.statusCode })
    }
    throw error
  }

  return jsonResponse({ success: true, post }, { status: 201 })
})
