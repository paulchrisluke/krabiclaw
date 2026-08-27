import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { cleanString, cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'
import { deleteMediaAsset } from '~/server/utils/media-asset-manager'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

export default defineHandler(async (event) => {
  const requestId = getRouterParam(event, 'requestId')
  const assetId = getRouterParam(event, 'assetId')
  if (!requestId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  const userId = session?.user?.id
  if (!userId) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  const token = cleanString((await readRequiredBody<ApiRecord>(event)).token, 300)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })
  const result = await getReviewRequestByToken(db, token)
  if (!result || result.request.id !== requestId) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
  if (result.request.user_id !== userId && result.request.anonymous_user_id !== userId) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  }
  const placement = await queryFirst<{ id: string; asset_status: string }>(db, `
    SELECT mp.id, ma.status AS asset_status
      FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id
     WHERE mp.owner_type = 'review_request' AND mp.owner_id = ? AND mp.asset_id = ?
       AND mp.site_id = ? LIMIT 1
  `, [requestId, assetId, result.context.site_id])
  if (!placement) return jsonResponse({ error: 'Review media not found' }, { status: 404 })
  const claim = await execute(db, 'DELETE FROM media_placements WHERE id = ? AND owner_type = ? AND owner_id = ? AND asset_id = ?', [placement.id, 'review_request', requestId, assetId])
  if (Number(claim?.meta?.changes ?? 0) !== 1) {
    return jsonResponse({ deleted: true, asset_id: assetId })
  }
  if (placement.asset_status !== 'deleted') {
    await deleteMediaAsset(db, env, assetId, result.context.site_id, userId)
  }
  return jsonResponse({ deleted: true, asset_id: assetId })
})
