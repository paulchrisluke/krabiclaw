// PATCH /api/editor/sites/[siteId]/media/[assetId]
// Update mutable asset metadata. Ownership is managed through media placements.
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateMediaAssetMetadata, type MediaAsset } from '~/server/utils/media-asset-manager'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'

interface MediaAssetSiteRow {
  id: string
  site_id: string
  organization_id: string
}

const VALID_CATEGORIES = new Set(['exterior', 'interior', 'food', 'menu', 'team', 'other'])

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const assetId = getRouterParam(event, 'assetId')
  if (!siteId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, env, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  try {
    const asset = await queryFirst<MediaAssetSiteRow>(
      db, `SELECT id, site_id, organization_id FROM media_assets WHERE id = ? LIMIT 1`, [assetId], )
    if (!asset) return jsonResponse({ error: 'Asset not found' }, { status: 404 })
    if (asset.site_id !== siteId) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const principal = { env, memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId }
    await assertResourceAccess(db, { ...principal, resourceLocationId: null })

    const body = await readBody(event)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
    }
    const updates: { alt_text?: string | null; category?: MediaAsset['category'] } = {}
    if ('alt_text' in body) {
      if (body.alt_text !== null && typeof body?.alt_text !== 'string') {
        return jsonResponse({ error: 'alt_text must be a string or null' }, { status: 400 })
      }
      updates.alt_text = body.alt_text === null ? null : body.alt_text.trim().slice(0, 500)
    }

    if ('category' in body) {
      if (body.category !== null && body.category !== '' && typeof body.category !== 'string') {
        return jsonResponse({ error: 'category must be a string or null' }, { status: 400 })
      }
      const category = typeof body.category === 'string' ? body.category.trim() : ''
      if (category && !VALID_CATEGORIES.has(category)) {
        return jsonResponse({ error: 'Invalid category' }, { status: 400 })
      }
      updates.category = (category || null) as MediaAsset['category']
    }

    const updated = await updateMediaAssetMetadata(db, assetId, siteId, updates)
    if (!updated) return jsonResponse({ error: 'Asset not found' }, { status: 404 })

    return jsonResponse({ updated: true })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('media_patch_failed', {
      siteId, assetId, userId: session.user.id, error: normalizedError.message
    })
    return jsonResponse({ error: 'Failed to update media asset' }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
