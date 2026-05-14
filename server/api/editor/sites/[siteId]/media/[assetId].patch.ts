// PATCH /api/editor/sites/[siteId]/media/[assetId]
// Update mutable metadata: alt_text only. URLs are managed by Cloudflare.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateMediaAssetAlt } from '~/server/utils/media-asset-manager'

interface MediaAssetSiteRow {
  id: string
  site_id: string
}

async function verifySiteAccess(db: D1Database, userId: string, siteId: string): Promise<boolean> {
  const site = await db.prepare(`
    SELECT s.id
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, userId).first()

  return Boolean(site)
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const assetId = getRouterParam(event, 'assetId')
  if (!siteId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const hasAccess = await verifySiteAccess(db, session.user.id, siteId)
  if (!hasAccess) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  try {
    const asset = await db.prepare(
      `SELECT id, site_id FROM media_assets WHERE id = ? LIMIT 1`
    ).bind(assetId).first<MediaAssetSiteRow>()
    if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })
    if (asset.site_id !== siteId) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const body = await readBody(event)
    if ('alt_text' in (body || {})) {
      if (typeof body?.alt_text !== 'string') {
        return jsonResponse({ error: 'alt_text must be a string' }, { status: 400 })
      }

      const altText = body.alt_text.trim().slice(0, 500)
      const updated = await updateMediaAssetAlt(db, assetId, siteId, altText)
      if (!updated) return jsonResponse({ error: 'Asset not found' }, { status: 404 })
    }

    return jsonResponse({ updated: true })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('media_patch_failed', {
      siteId,
      assetId,
      userId: session.user.id,
      error: normalizedError.message
    })
    return jsonResponse({ error: 'Failed to update media asset' }, { status: 500 })
  }
})
