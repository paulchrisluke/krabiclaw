// POST /api/editor/sites/[siteId]/media/request-video-upload
// Returns a Cloudflare Stream TUS upload URL. Client uploads directly to Stream —
// no server buffering, no 50 MB cap. Videos can be up to 300 seconds / ~1 GB.
// After the TUS upload completes the client calls /confirm-video-upload to activate the asset.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { requestStreamUpload, isStreamConfigured, deleteStreamVideo } from '~/server/utils/cloudflare-stream'
import { createMediaAsset } from '~/server/utils/media-asset-manager'

const VALID_CATEGORIES = new Set(['exterior', 'interior', 'food', 'menu', 'team', 'other'])
type MediaCategory = 'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other'

interface SiteRow { organization_id: string }

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.REVIEWS_DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

    if (!isStreamConfigured(env)) {
      return jsonResponse({ error: 'Cloudflare Stream not configured' }, { status: 503 })
    }

    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const site = await db.prepare(
      `SELECT organization_id FROM sites WHERE id = ? LIMIT 1`
    ).bind(siteId).first<SiteRow>()
    if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

    const membership = await db.prepare(`
      SELECT userId FROM member
      WHERE organizationId = ? AND userId = ? AND role IN ('owner','admin','editor')
      LIMIT 1
    `).bind(site.organization_id, session.user.id).first()
    if (!membership) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const body = await readBody(event)
    const filename = typeof body?.filename === 'string' ? body.filename.trim().slice(0, 255) : 'video'

    let locationId: string | null = null
    if (body?.locationId) {
      const loc = await db.prepare(
        `SELECT id FROM business_locations WHERE id = ? AND site_id = ? AND organization_id = ? LIMIT 1`
      ).bind(String(body.locationId), siteId, site.organization_id).first()
      if (!loc) return jsonResponse({ error: 'Invalid locationId' }, { status: 400 })
      locationId = String(body.locationId)
    }

    let category: MediaCategory | null = null
    if (body?.category) {
      const c = String(body.category).trim()
      if (!VALID_CATEGORIES.has(c)) return jsonResponse({ error: 'Invalid category' }, { status: 400 })
      category = c as MediaCategory
    }

    const assetId = crypto.randomUUID()
    let streamUid = ''

    try {
      const { uid, uploadUrl } = await requestStreamUpload(env, {
        filename,
        meta: { siteId, assetId, uploadedBy: session.user.id },
      })
      streamUid = uid

      await createMediaAsset(db, {
        id: assetId,
        organization_id: site.organization_id,
        site_id: siteId,
        location_id: locationId,
        kind: 'video',
        provider: 'cloudflare_stream',
        source: 'uploaded',
        stream_uid: streamUid,
        status: 'pending',
        file_name: filename,
        category,
        created_by_user_id: session.user.id,
      })

      return jsonResponse({ assetId, uploadUrl, streamUid })
    } catch (error) {
      if (streamUid) {
        try { await deleteStreamVideo(env, streamUid) } catch { /* best-effort cleanup */ }
      }
      throw error
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('request_video_upload_failed', { error: msg })
    return jsonResponse({ error: 'Failed to initialise video upload', message: msg }, { status: 500 })
  }
})
