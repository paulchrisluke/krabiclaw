// POST /api/editor/sites/[siteId]/media/[assetId]/confirm
// Called after client has uploaded directly to Cloudflare Images.
// Marks the asset active and resolves the public URL.
import { execute, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { buildImageUrl, hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { activateMediaAsset, getMediaAsset } from '~/server/utils/media-asset-manager'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const assetId = getRouterParam(event, 'assetId')
  if (!siteId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const asset = await getMediaAsset(db, assetId, siteId)
  if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })

  try {
    await assertResourceAccess(db, {
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: asset.location_id ?? null,
    })
  } catch (error) {
    rethrowHttpError(error)
    throw error
  }

  if (asset.status !== 'pending') return jsonResponse({ error: 'Asset already confirmed' }, { status: 409 })
  if (!asset.cloudflare_image_id) return jsonResponse({ error: 'Asset has no Cloudflare image ID' }, { status: 422 })
  if (!hasCloudflareImagesConfig(env)) return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })

  const publicUrl = buildImageUrl(env, asset.cloudflare_image_id, 'public')
  const thumbnailUrl = buildImageUrl(env, asset.cloudflare_image_id, 'thumbnail')

  const activated = await activateMediaAsset(db, assetId, siteId, { public_url: publicUrl, thumbnail_url: thumbnailUrl })
  if (!activated) return jsonResponse({ error: 'Asset already confirmed' }, { status: 409 })

  const siteRecord = await queryFirst<{ logo_asset_id: string | null; og_image_asset_id: string | null }>(
    db,
    `SELECT logo_asset_id, og_image_asset_id FROM sites WHERE id = ? LIMIT 1`,
    [siteId],
  )

  if (siteRecord && asset.category === 'logo' && !siteRecord.logo_asset_id) {
    await execute(db, `UPDATE sites SET logo_asset_id = ?, updated_at = ? WHERE id = ?`, [assetId, new Date().toISOString(), siteId])
  }

  return jsonResponse({ id: assetId, publicUrl, thumbnailUrl, status: 'active' })
})
