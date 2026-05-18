// POST /api/editor/sites/[siteId]/media/confirm-video-upload
// Called after the client finishes the TUS upload to Stream.
// Polls Stream for the video UID, writes public_url + thumbnail_url, and marks the asset active.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import {
  getStreamVideo,
  buildStreamDownloadUrl,
  buildStreamThumbnailUrl,
} from '~/server/utils/cloudflare-stream'

interface AssetRow {
  id: string
  organization_id: string
  stream_uid: string | null
  status: string
}

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.REVIEWS_DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const { assetId } = await readBody(event)
    if (!assetId || typeof assetId !== 'string') {
      return jsonResponse({ error: 'assetId required' }, { status: 400 })
    }

    const asset = await db.prepare(`
      SELECT id, organization_id, stream_uid, status
      FROM media_assets
      WHERE id = ? AND site_id = ? AND provider = 'cloudflare_stream'
      LIMIT 1
    `).bind(assetId, siteId).first<AssetRow>()

    if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })

    const membership = await db.prepare(`
      SELECT userId FROM member
      WHERE organizationId = ? AND userId = ? AND role IN ('owner','admin','editor')
      LIMIT 1
    `).bind(asset.organization_id, session.user.id).first()
    if (!membership) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    if (!asset.stream_uid) {
      return jsonResponse({ error: 'No Stream UID on this asset' }, { status: 422 })
    }

    const video = await getStreamVideo(env, asset.stream_uid)

    // Stream states: pendingupload → uploading → queued → inprogress → ready | error
    if (video.state === 'error') {
      await db.prepare(`UPDATE media_assets SET status = 'failed', updated_at = ? WHERE id = ?`)
        .bind(new Date().toISOString(), assetId).run()
      return jsonResponse({ status: 'failed' }, { status: 422 })
    }

    if (video.state !== 'ready') {
      return jsonResponse({ status: video.state, ready: false })
    }

    const publicUrl = buildStreamDownloadUrl(env, asset.stream_uid)
    const thumbnailUrl = buildStreamThumbnailUrl(env, asset.stream_uid)

    await db.prepare(`
      UPDATE media_assets
      SET status = 'active', public_url = ?, thumbnail_url = ?,
          width = ?, height = ?, duration = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      publicUrl, thumbnailUrl,
      video.width, video.height, video.duration,
      new Date().toISOString(),
      assetId
    ).run()

    return jsonResponse({ status: 'ready', ready: true, publicUrl, thumbnailUrl })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('confirm_video_upload_failed', { error: msg })
    return jsonResponse({ error: 'Failed to confirm video upload', message: msg }, { status: 500 })
  }
})
