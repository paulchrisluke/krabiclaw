import { createError, getHeader, getRequestWebStream } from 'h3'
import { REVIEW_VIDEO_MAX_BYTES, REVIEW_VIDEO_MAX_LABEL } from '~/config/media-limits'
import { cleanString, cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { executeBatch, queryFirst } from '~/server/db'
import { getAuthSession } from '~/server/utils/auth'
import { buildR2Key, getR2Url } from '~/server/utils/cloudflare-r2'
import { sniffMediaMimeType, VIDEO_MIME_TYPES } from '~/server/utils/media-mime'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

const SIGNATURE_BYTES = 1024

function sanitizeFilename(raw: string): string {
  const sanitized = raw
    .replace(/[\\/]+/g, '-')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return sanitized || 'review-video'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function uploadAndCleanupError(uploadError: unknown, cleanupError: unknown): AggregateError {
  return new AggregateError(
    [uploadError, cleanupError],
    `Review video upload failed: ${errorMessage(uploadError)}; R2 cleanup failed: ${errorMessage(cleanupError)}`,
  )
}

export default defineEventHandler(async (event) => {
  try {
    const requestId = getRouterParam(event, 'requestId')
    if (!requestId) return jsonResponse({ error: 'requestId required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
    if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'MEDIA_BUCKET binding not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    const sessionUser = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined)
    if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const token = cleanString(getHeader(event, 'x-review-token'), 300)
    if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

    const result = await getReviewRequestByToken(db, token)
    if (!result || result.request.id !== requestId) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
    if (result.request.user_id && result.request.user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })
    if (result.request.anonymous_user_id && result.request.anonymous_user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const existingVideos = await queryFirst<{ count: number }>(db, `
      SELECT COUNT(*) AS count
      FROM review_media
      WHERE review_request_id = ? AND kind = 'video' AND status != 'deleted'
    `, [requestId])
    if (Number(existingVideos?.count ?? 0) >= 2) return jsonResponse({ error: 'You can upload up to 2 videos.' }, { status: 400 })

    const contentLengthHeader = getHeader(event, 'content-length')
    if (!contentLengthHeader) return jsonResponse({ error: 'Content-Length header required' }, { status: 411 })
    if (!/^\d+$/.test(contentLengthHeader)) return jsonResponse({ error: 'Invalid Content-Length header' }, { status: 400 })
    const contentLength = Number(contentLengthHeader)
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      return jsonResponse({ error: 'Invalid Content-Length header' }, { status: 400 })
    }
    if (contentLength > REVIEW_VIDEO_MAX_BYTES) {
      return jsonResponse({ error: `Videos must be ${REVIEW_VIDEO_MAX_LABEL} or smaller.` }, { status: 413 })
    }

    const declaredContentType = (getHeader(event, 'content-type') ?? '')
      .split(';', 1)[0]
      ?.toLowerCase()
      .trim() ?? ''
    if (!VIDEO_MIME_TYPES.has(declaredContentType)) {
      return jsonResponse({ error: 'Accepted video formats are MP4 and WebM. .mov files are not supported.' }, { status: 415 })
    }

    const encodedFilename = getHeader(event, 'x-file-name')
    if (!encodedFilename) return jsonResponse({ error: 'File name required' }, { status: 400 })
    let decodedFilename: string
    try {
      decodedFilename = decodeURIComponent(encodedFilename)
    } catch {
      return jsonResponse({ error: 'Invalid file name' }, { status: 400 })
    }
    const filename = sanitizeFilename(decodedFilename)

    const body = getRequestWebStream(event)
    if (!body) return jsonResponse({ error: 'Video body required' }, { status: 400 })

    const assetId = crypto.randomUUID()
    const mediaLinkId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const r2Key = buildR2Key(result.context.site_id, assetId, filename)
    const publicUrl = getR2Url(env, r2Key)
    let uploadAttempted = false

    try {
      uploadAttempted = true
      const uploadedObject = await env.MEDIA_BUCKET.put(r2Key, body, {
        httpMetadata: { contentType: declaredContentType },
      })

      if (uploadedObject.size !== contentLength) {
        throw createError({ statusCode: 400, statusMessage: 'Content-Length did not match the uploaded video' })
      }

      const signatureObject = await env.MEDIA_BUCKET.get(r2Key, {
        range: { offset: 0, length: Math.min(SIGNATURE_BYTES, contentLength) },
      })
      if (!signatureObject) throw new Error('Uploaded video was not readable from R2')

      const signature = new Uint8Array(await signatureObject.arrayBuffer())
      if (sniffMediaMimeType(signature) !== declaredContentType) {
        throw createError({ statusCode: 400, statusMessage: 'File type mismatch' })
      }

      const now = new Date().toISOString()
      await executeBatch(db, [
        {
          query: `
            INSERT INTO media_assets (
              id, organization_id, site_id, location_id, kind, provider, source,
              r2_key, public_url, thumbnail_url, mime_type, file_name, file_size,
              category, status, created_by_user_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'video', 'cloudflare_r2', 'uploaded', ?, ?, NULL, ?, ?, ?, 'other', 'active', ?, ?, ?)
          `,
          params: [
            assetId,
            result.context.organization_id,
            result.context.site_id,
            result.context.location_id,
            r2Key,
            publicUrl,
            declaredContentType,
            filename,
            contentLength,
            sessionUser.id,
            now,
            now,
          ],
        },
        {
          query: `
            INSERT INTO review_media (
              id, review_request_id, customer_id, media_asset_id, kind, sort_order, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'video', ?, 'pending', ?, ?)
          `,
          params: [
            mediaLinkId,
            requestId,
            result.request.customer_id,
            assetId,
            Number(existingVideos?.count ?? 0),
            now,
            now,
          ],
        },
        {
          query: `
            UPDATE review_requests
            SET user_id = COALESCE(user_id, ?),
                anonymous_user_id = COALESCE(anonymous_user_id, ?),
                updated_at = ?
            WHERE id = ?
          `,
          params: [
            sessionUser.isAnonymous ? null : sessionUser.id,
            sessionUser.isAnonymous ? sessionUser.id : null,
            now,
            requestId,
          ],
        },
        {
          query: `
            INSERT INTO site_events (
              id, organization_id, site_id, location_id, actor_id,
              event_type, entity_type, entity_id, metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, 'media.uploaded', 'media_asset', ?, ?, ?)
          `,
          params: [
            eventId,
            result.context.organization_id,
            result.context.site_id,
            result.context.location_id,
            sessionUser.id,
            assetId,
            JSON.stringify({ kind: 'video', provider: 'cloudflare_r2', source: 'uploaded', status: 'active' }),
            now,
          ],
        },
      ])
    } catch (uploadError) {
      if (uploadAttempted) {
        try {
          await env.MEDIA_BUCKET.delete(r2Key)
        } catch (cleanupError) {
          throw uploadAndCleanupError(uploadError, cleanupError)
        }
      }
      throw uploadError
    }

    return jsonResponse({
      assetId,
      mediaId: mediaLinkId,
      publicUrl,
      thumbnailUrl: null,
      kind: 'video',
      status: 'pending',
    }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown review video upload error')
    console.error('review_video_upload_failed', { error: normalizedError.message, stack: normalizedError.stack })
    return jsonResponse({
      error: normalizedError instanceof AggregateError ? normalizedError.message : 'Failed to upload review video',
      message: normalizedError.message,
    }, { status: 500 })
  }
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
