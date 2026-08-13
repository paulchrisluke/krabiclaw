import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst, type DbClient } from '~/server/db'
import { deleteMediaAsset } from '~/server/utils/media-asset-manager'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

interface ReviewMediaDeleteState {
  id: string
  link_status: 'pending' | 'deleted'
  media_asset_status: string
}

async function getReviewMediaDeleteState(
  db: DbClient,
  input: {
    requestId: string
    assetId: string
    customerId: string
    siteId: string
  },
): Promise<ReviewMediaDeleteState | null> {
  return await queryFirst<ReviewMediaDeleteState>(db, `
    SELECT
      rm.id,
      rm.status AS link_status,
      ma.status AS media_asset_status
    FROM review_media rm
    JOIN media_assets ma ON ma.id = rm.media_asset_id
    WHERE rm.review_request_id = ?
      AND rm.media_asset_id = ?
      AND rm.customer_id = ?
      AND rm.review_id IS NULL
      AND rm.status IN ('pending', 'deleted')
      AND ma.site_id = ?
    LIMIT 1
  `, [input.requestId, input.assetId, input.customerId, input.siteId]) ?? null
}

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, 'requestId')
  const assetId = getRouterParam(event, 'assetId')
  if (!requestId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  const sessionUser = session?.user as ({ id?: string } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody<ApiRecord>(event)
  const token = cleanString(body.token, 300)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const result = await getReviewRequestByToken(db, token)
  if (!result || result.request.id !== requestId) {
    return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
  }
  const sessionOwnsRequest = result.request.user_id === sessionUser.id
    || result.request.anonymous_user_id === sessionUser.id
  if (!sessionOwnsRequest) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  let link = await getReviewMediaDeleteState(db, {
    requestId,
    assetId,
    customerId: result.request.customer_id,
    siteId: result.context.site_id,
  })
  if (!link) return jsonResponse({ error: 'Review media not found' }, { status: 404 })
  const reviewMediaId = link.id
  if (link.link_status === 'deleted' && link.media_asset_status === 'deleted') {
    return jsonResponse({ deleted: true, assetId })
  }

  let claimedPendingLink = false
  try {
    if (link.link_status === 'pending') {
      const claim = await execute(db, `
        UPDATE review_media
        SET status = 'deleted', updated_at = ?
        WHERE id = ?
          AND review_request_id = ?
          AND media_asset_id = ?
          AND customer_id = ?
          AND review_id IS NULL
          AND status = 'pending'
      `, [
        new Date().toISOString(),
        reviewMediaId,
        requestId,
        assetId,
        result.request.customer_id,
      ])
      if (Number(claim?.meta?.changes ?? 0) === 1) {
        claimedPendingLink = true
        link = { ...link, link_status: 'deleted' }
      } else {
        link = await getReviewMediaDeleteState(db, {
          requestId,
          assetId,
          customerId: result.request.customer_id,
          siteId: result.context.site_id,
        })
        if (!link) return jsonResponse({ error: 'Review media not found' }, { status: 404 })
      }
    }

    if (link.media_asset_status !== 'deleted') {
      try {
        await deleteMediaAsset(db, env, assetId, result.context.site_id, sessionUser.id)
      } catch (error) {
        // Another request may have completed the exact same deletion while this
        // request was in flight. Only the scoped row's persisted state can turn
        // that failure into an idempotent success.
        link = await getReviewMediaDeleteState(db, {
          requestId,
          assetId,
          customerId: result.request.customer_id,
          siteId: result.context.site_id,
        })
        if (link?.media_asset_status !== 'deleted') {
          if (claimedPendingLink) {
            try {
              const rollback = await execute(db, `
                UPDATE review_media
                SET status = 'pending', updated_at = ?
                WHERE id = ?
                  AND review_request_id = ?
                  AND media_asset_id = ?
                  AND customer_id = ?
                  AND review_id IS NULL
                  AND status = 'deleted'
                  AND EXISTS (
                    SELECT 1
                    FROM media_assets ma
                    WHERE ma.id = review_media.media_asset_id
                      AND ma.site_id = ?
                      AND ma.status != 'deleted'
                  )
              `, [
                new Date().toISOString(),
                reviewMediaId,
                requestId,
                assetId,
                result.request.customer_id,
                result.context.site_id,
              ])
              if (Number(rollback?.meta?.changes ?? 0) !== 1) {
                const persisted = await getReviewMediaDeleteState(db, {
                  requestId,
                  assetId,
                  customerId: result.request.customer_id,
                  siteId: result.context.site_id,
                })
                if (persisted?.link_status === 'deleted' && persisted.media_asset_status === 'deleted') {
                  link = persisted
                } else if (persisted?.link_status !== 'pending') {
                  throw new Error(`Review media ${reviewMediaId} could not be restored for retry`)
                }
              }
            } catch (rollbackError) {
              throw new AggregateError(
                [error, rollbackError],
                `Review media provider deletion failed, and ${reviewMediaId} could not be restored for retry`,
              )
            }
          }
          if (link?.media_asset_status !== 'deleted') throw error
        }
      }
    }

    const finalize = await execute(db, `
      UPDATE review_media
      SET status = 'deleted', updated_at = ?
      WHERE id = ?
        AND review_request_id = ?
        AND media_asset_id = ?
        AND customer_id = ?
        AND review_id IS NULL
        AND status IN ('pending', 'deleted')
    `, [
      new Date().toISOString(),
      reviewMediaId,
      requestId,
      assetId,
      result.request.customer_id,
    ])
    if (Number(finalize?.meta?.changes ?? 0) !== 1) {
      const persisted = await getReviewMediaDeleteState(db, {
        requestId,
        assetId,
        customerId: result.request.customer_id,
        siteId: result.context.site_id,
      })
      if (persisted?.link_status !== 'deleted' || persisted.media_asset_status !== 'deleted') {
        throw new Error(`Review media ${reviewMediaId} changed during deletion`)
      }
    }

    return jsonResponse({ deleted: true, assetId })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown review media deletion error')
    console.error('review_media_delete_failed', {
      requestId,
      assetId,
      error: normalizedError.message,
    })
    return jsonResponse({
      error: 'Could not remove this media. It is still listed, so please try again.',
    }, { status: 500 })
  }
})
