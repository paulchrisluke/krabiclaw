import { execute, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasCloudflareImagesConfig, uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { sniffMediaMimeType } from '~/server/utils/media-mime'
import { parseOnboardingDraftPayload, type DraftUploadedImage } from '~/server/utils/onboarding-drafts'

const ALLOWED_IMAGE_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])

function sanitizeFilename(raw: string | undefined): string {
  const sanitized = (raw ?? '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return sanitized || 'draft-image'
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(data.byteLength)
  new Uint8Array(copy).set(data)
  return copy
}

export default defineHandler(async (event) => {
  try {
    const draftId = String(getRouterParam(event, 'draftId') || '').trim()
    if (!draftId) return jsonResponse({ error: 'Draft id is required' }, { status: 400 })

    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    if (!hasCloudflareImagesConfig(env)) {
      return jsonResponse({ error: 'Cloudflare Images not configured' }, { status: 503 })
    }

    const draft = await queryFirst<{ id: string; user_id: string; status: string; payload_json: string; updated_at: string }>(db, `
      SELECT id, user_id, status, payload_json, updated_at
      FROM onboarding_drafts
      WHERE id = ?
      LIMIT 1
    `, [draftId])

    if (!draft || draft.user_id !== session.user.id || draft.status !== 'active') {
      return jsonResponse({ error: 'Draft not found' }, { status: 404 })
    }

    const formData = await readMultipartFormData(event)
    if (!formData) return jsonResponse({ error: 'Multipart form data required' }, { status: 400 })

    const targetPart = formData.find(part => part.name === 'target')
    const target = targetPart?.data ? Buffer.from(targetPart.data).toString().trim() : ''
    if (target !== 'logo' && target !== 'hero') {
      return jsonResponse({ error: 'target must be logo or hero' }, { status: 400 })
    }

    const filePart = formData.find(part => part.name === 'file')
    if (!filePart?.data) return jsonResponse({ error: 'file field required' }, { status: 400 })

    const contentType = sniffMediaMimeType(filePart.data)
    const declaredContentType = typeof filePart.type === 'string'
      ? filePart.type.split(';', 1)[0]?.toLowerCase().trim() || ''
      : ''
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return jsonResponse({ error: `Unsupported image type: ${contentType}` }, { status: 415 })
    }
    if (declaredContentType && declaredContentType !== contentType) {
      return jsonResponse({ error: 'File type mismatch' }, { status: 400 })
    }

    const fileSize = filePart.data.byteLength
    if (fileSize > 10 * 1024 * 1024) {
      return jsonResponse({ error: 'Image too large (max 10 MB)' }, { status: 413 })
    }

    const filename = sanitizeFilename(filePart.filename)
    const uploaded = await uploadImageBuffer(env, toArrayBuffer(filePart.data), filename, contentType)
    const image: DraftUploadedImage = {
      draftAssetId: crypto.randomUUID(), cloudflareImageId: uploaded.imageId, publicUrl: uploaded.publicUrl, thumbnailUrl: uploaded.thumbnailUrl, mimeType: contentType, fileName: filename, fileSize, }

    let currentUpdatedAt = draft.updated_at
    for (let attempt = 0; attempt < 3; attempt++) {
      const currentDraft = attempt === 0
        ? draft
        : await queryFirst<{ id: string; user_id: string; status: string; payload_json: string; updated_at: string }>(db, `
            SELECT id, user_id, status, payload_json, updated_at
            FROM onboarding_drafts
            WHERE id = ? AND user_id = ? AND status = 'active'
            LIMIT 1
          `, [draftId, session.user.id])
      if (!currentDraft) return jsonResponse({ error: 'Draft not found' }, { status: 404 })
      currentUpdatedAt = currentDraft.updated_at
      const payload = parseOnboardingDraftPayload(currentDraft.payload_json)
      payload.preview.media = payload.preview.media.filter(item => item.slot !== target)
      payload.preview.media.push({ slot: target, asset: image })
      if (target === 'logo') {
        payload.preview.config.draft_logo_note = filename
      } else {
        payload.preview.config.draft_hero_photo_note = filename
      }

      const updatedAt = new Date().toISOString()
      const result = await execute(db, `
        UPDATE onboarding_drafts
        SET payload_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND status = 'active' AND updated_at = ?
      `, [JSON.stringify(payload), updatedAt, draftId, session.user.id, currentUpdatedAt])
      if ((result.meta?.changes ?? 0) > 0) {
        return jsonResponse({
          success: true, image, })
      }
    }
    return jsonResponse({ error: 'Failed to upload draft media' }, { status: 409 })
  } catch (error) {
    rethrowHttpError(error)
    const normalized = error instanceof Error ? error : new Error('Unknown draft media upload error')
    console.error('onboarding_draft_media_upload_failed', {
      error: normalized.message, stack: normalized.stack, })
    return jsonResponse({ error: 'Failed to upload draft media' }, { status: 503 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readMultipartFormData  } from 'nitro/h3';
