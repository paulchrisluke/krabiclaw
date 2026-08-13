import { createError, getHeader, getQuery, getRequestWebStream } from 'h3'
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { buildR2Key, getR2Url } from '~/server/utils/cloudflare-r2'
import { assertResourceAccess } from '~/server/utils/member-access'
import { createMediaAsset } from '~/server/utils/media-asset-manager'
import { sniffMediaMimeType, VIDEO_MIME_TYPES, MAX_VIDEO_BYTES } from '~/server/utils/media-mime'

const VALID_CATEGORIES = new Set(['exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo'])
const SIGNATURE_BYTES = 1024
type MediaCategory = 'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other' | 'logo'

function sanitizeFilename(raw: string | undefined): string {
  const sanitized = (raw ?? '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return sanitized || 'upload'
}

function queryValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function uploadAndCleanupError(uploadError: unknown, cleanupError: unknown): AggregateError {
  return new AggregateError(
    [uploadError, cleanupError],
    `Video upload failed: ${errorMessage(uploadError)}; R2 cleanup failed: ${errorMessage(cleanupError)}`,
  )
}

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'siteId')
    if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
    if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'MEDIA_BUCKET binding not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const site = await queryFirst<{ organization_id: string }>(
      db,
      `SELECT organization_id FROM sites WHERE id = ? LIMIT 1`,
      [siteId],
    )
    if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

    const membership = await queryFirst<{ userId: string; member_id: string; member_role: string }>(db, `
      SELECT m.userId, m.id AS member_id, m.role AS member_role
      FROM member m
      WHERE m.organizationId = ?
        AND m.userId = ?
      LIMIT 1
    `, [site.organization_id, session.user.id])
    if (!membership) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

    const query = getQuery(event)
    const locationId = queryValue(query.locationId)
    if (locationId) {
      const location = await queryFirst(db, `
        SELECT id
        FROM business_locations
        WHERE id = ? AND site_id = ? AND organization_id = ?
        LIMIT 1
      `, [locationId, siteId, site.organization_id])
      if (!location) return jsonResponse({ error: 'Invalid locationId' }, { status: 400 })
    }

    await assertResourceAccess(db, {
      memberId: membership.member_id,
      role: membership.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: locationId,
    })

    const rawCategory = queryValue(query.category)
    let category: MediaCategory | null = null
    if (rawCategory) {
      if (!VALID_CATEGORIES.has(rawCategory)) return jsonResponse({ error: 'Invalid category' }, { status: 400 })
      category = rawCategory as MediaCategory
    }

    const contentLengthHeader = getHeader(event, 'content-length')
    if (!contentLengthHeader) {
      return jsonResponse({ error: 'Content-Length header required' }, { status: 411 })
    }
    if (!/^\d+$/.test(contentLengthHeader)) {
      return jsonResponse({ error: 'Invalid Content-Length header' }, { status: 400 })
    }
    const contentLength = Number(contentLengthHeader)
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      return jsonResponse({ error: 'Invalid Content-Length header' }, { status: 400 })
    }
    if (contentLength > MAX_VIDEO_BYTES) {
      return jsonResponse({ error: 'File too large (max 50 MB)' }, { status: 413 })
    }

    const declaredContentType = (getHeader(event, 'content-type') ?? '')
      .split(';', 1)[0]
      ?.toLowerCase()
      .trim() ?? ''
    if (!VIDEO_MIME_TYPES.has(declaredContentType)) {
      return jsonResponse({ error: `Unsupported file type: ${declaredContentType || 'unknown'}` }, { status: 415 })
    }

    const body = getRequestWebStream(event)
    if (!body) return jsonResponse({ error: 'Video body required' }, { status: 400 })

    const filename = sanitizeFilename(queryValue(query.filename) ?? undefined)
    const assetId = crypto.randomUUID()
    const r2Key = buildR2Key(siteId, assetId, filename)
    const publicUrl = getR2Url(env, r2Key)
    let stored = false

    try {
      const uploadedObject = await env.MEDIA_BUCKET.put(r2Key, body, {
        httpMetadata: { contentType: declaredContentType },
      })
      stored = true

      if (uploadedObject.size !== contentLength) {
        throw createError({ statusCode: 400, statusMessage: 'Content-Length did not match the uploaded video' })
      }

      const signatureObject = await env.MEDIA_BUCKET.get(r2Key, {
        range: { offset: 0, length: Math.min(SIGNATURE_BYTES, contentLength) },
      })
      if (!signatureObject) {
        throw new Error('Uploaded video was not readable from R2')
      }

      const signature = new Uint8Array(await signatureObject.arrayBuffer())
      const detectedContentType = sniffMediaMimeType(signature)
      if (detectedContentType !== declaredContentType) {
        throw createError({ statusCode: 400, statusMessage: 'File type mismatch' })
      }

      await createMediaAsset(db, {
        id: assetId,
        organization_id: site.organization_id,
        site_id: siteId,
        location_id: locationId,
        kind: 'video',
        provider: 'cloudflare_r2',
        source: 'uploaded',
        r2_key: r2Key,
        public_url: publicUrl,
        thumbnail_url: null,
        mime_type: declaredContentType,
        file_name: filename,
        file_size: contentLength,
        category,
        status: 'active',
        created_by_user_id: session.user.id,
      })
    } catch (uploadError) {
      if (stored) {
        try {
          await env.MEDIA_BUCKET.delete(r2Key)
        } catch (cleanupError) {
          throw uploadAndCleanupError(uploadError, cleanupError)
        }
      }
      throw uploadError
    }

    return jsonResponse({
      id: assetId,
      publicUrl,
      thumbnailUrl: null,
      kind: 'video',
      status: 'active',
    })
  } catch (error) {
    rethrowHttpError(error)
    const normalizedError = error instanceof Error ? error : new Error('Unknown media upload error')
    console.error('media_upload_failed', { error: normalizedError.message, stack: normalizedError.stack })
    return jsonResponse({
      error: normalizedError instanceof AggregateError ? normalizedError.message : 'Failed to upload media',
      message: normalizedError.message,
    }, { status: 500 })
  }
})
