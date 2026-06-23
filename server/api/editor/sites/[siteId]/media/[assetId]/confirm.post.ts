// POST /api/editor/sites/[siteId]/media/[assetId]/confirm
// Called after client has uploaded directly to Cloudflare Images.
// Marks the asset active and resolves the public URL.
import { execute, queryFirst, type DbClient } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { buildImageUrl, hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { activateMediaAsset, getMediaAsset } from '~/server/utils/media-asset-manager'

async function verifySiteAccess(db: DbClient, userId: string, siteId: string): Promise<boolean> {
  const site = await queryFirst(db, `
    SELECT s.id
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `, [siteId, userId])

  return Boolean(site)
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const assetId = getRouterParam(event, 'assetId')
  if (!siteId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const hasAccess = await verifySiteAccess(db, session.user.id, siteId)
  if (!hasAccess) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  const asset = await getMediaAsset(db, assetId, siteId)
  if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })
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
