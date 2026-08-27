import { getErrorMessage } from '~/utils/errors'

export const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024

export interface MediaUploadOptions {
  category?: string | null
}

export interface PendingMediaUpload {
  file: File
  options: MediaUploadOptions
}

export interface MediaUploadResult {
  asset_id: string
  kind: 'image' | 'video'
  public_url?: string | null
  thumbnail_url?: string
}

function operationAndCleanupError(
  label: string,
  operationError: unknown,
  cleanupError: unknown,
): AggregateError {
  return new AggregateError(
    [operationError, cleanupError],
    `${label}: ${getErrorMessage(operationError, 'operation failed')}; cleanup failed: ${getErrorMessage(cleanupError, 'unknown cleanup error')}`,
  )
}

export function useMediaUpload(siteApiBase: string) {
  const dashboardApi = useDashboardApi()
  const uploading = ref(false)
  const error = ref<string | null>(null)
  const pendingRetryFile = ref<PendingMediaUpload | null>(null)

  async function cleanupPendingUpload(assetId: string) {
    await dashboardApi(`${siteApiBase}/media/${assetId}`, {
      method: 'DELETE',
      validate: (value): value is { deleted: true } => isRecord(value) && value.deleted === true,
    })
  }

  async function confirmPendingUpload(assetId: string) {
    await dashboardApi(`${siteApiBase}/media/${assetId}/confirm`, {
      method: 'POST',
      validate: (value): value is { asset_id: string; public_url: string; thumbnail_url: string; status: 'active' } =>
        isRecord(value)
        && typeof value.asset_id === 'string'
        && typeof value.public_url === 'string'
        && typeof value.thumbnail_url === 'string'
        && value.status === 'active',
    })
  }

  async function upload(file: File, options: MediaUploadOptions = {}): Promise<MediaUploadResult | null> {
    if (uploading.value) return null

    uploading.value = true
    error.value = null
    pendingRetryFile.value = null

    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')

    try {
      if (!isImage && !isVideo) {
        error.value = 'Only images and videos are supported.'
        return null
      }

      if (isImage && file.size > IMAGE_MAX_SIZE_BYTES) {
        error.value = `Images must be under ${formatBytes(IMAGE_MAX_SIZE_BYTES)}.`
        return null
      }

      if (isVideo && file.size > VIDEO_MAX_SIZE_BYTES) {
        error.value = `Videos must be under ${formatBytes(VIDEO_MAX_SIZE_BYTES)}.`
        return null
      }

      if (isImage) {
        const { asset_id: assetId, upload_url: uploadUrl } = await dashboardApi<{ asset_id: string, upload_url: string }>(
          `${siteApiBase}/media/request-upload`,
          {
            method: 'POST',
            validate: validateApiShape({ asset_id: 'string', upload_url: 'string' }),
            body: {
              filename: file.name,
              category: options.category,
            }
          }
        )

        const form = new FormData()
        form.append('file', file)

        try {
          const response = await fetch(uploadUrl, {
            method: 'POST',
            body: form,
            signal: mediaUploadSignal(),
          })
          if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
        } catch (uploadError) {
          try {
            await cleanupPendingUpload(assetId)
          } catch (cleanupError) {
            throw operationAndCleanupError('Image upload failed', uploadError, cleanupError)
          }
          throw uploadError
        }

        try {
          await confirmPendingUpload(assetId)
        } catch (uploadError) {
          try {
            await cleanupPendingUpload(assetId)
          } catch (cleanupError) {
            throw operationAndCleanupError('Image confirmation failed', uploadError, cleanupError)
          }
          pendingRetryFile.value = { file, options }
          throw uploadError
        }

        return {
          asset_id: assetId,
          kind: 'image',
        }
      }

      const poster = await generateVideoThumbnail(file)
      const response = await dashboardApi<{
        asset_id: string
        kind: 'video'
        public_url: string
        thumbnail_url: string
        status: 'active'
      }>(`${siteApiBase}/media/upload`, {
        method: 'POST',
        body: (() => {
          const form = new FormData()
          form.append('video', file)
          form.append('thumbnail', poster)
          return form
        })(),
        query: {
          filename: file.name,
          category: options.category || undefined,
        },
        timeout: MEDIA_UPLOAD_TIMEOUT_MS,
        validate: (value): value is {
          asset_id: string
          kind: 'video'
          public_url: string
          thumbnail_url: string
          status: 'active'
        } => isRecord(value)
          && typeof value.asset_id === 'string'
          && value.kind === 'video'
          && typeof value.public_url === 'string'
          && typeof value.thumbnail_url === 'string'
          && value.status === 'active',
      })

      return {
        asset_id: response.asset_id,
        kind: response.kind,
        public_url: response.public_url,
        thumbnail_url: response.thumbnail_url,
      }
    } catch (uploadError) {
      error.value = getErrorMessage(uploadError, 'Upload failed.')
      throw uploadError
    } finally {
      uploading.value = false
    }
  }

  return {
    uploading,
    error,
    pendingRetryFile,
    upload,
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
