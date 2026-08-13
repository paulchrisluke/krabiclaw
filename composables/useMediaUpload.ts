export const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024

export interface MediaUploadOptions {
  locationId?: string | null
  category?: string | null
  poster?: File | null
}

export interface PendingMediaUpload {
  file: File
  options: MediaUploadOptions
}

export interface MediaUploadResult {
  id: string
  kind: 'image' | 'video'
  publicUrl?: string | null
  thumbnailUrl?: string | null
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const errorMessage = (data as Record<string, unknown>).error
      if (typeof errorMessage === 'string' && errorMessage) return errorMessage
    }

    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }

  return fallback
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
      validate: (value): value is { id: string; publicUrl: string; thumbnailUrl: string; status: 'active' } =>
        isRecord(value)
        && typeof value.id === 'string'
        && typeof value.publicUrl === 'string'
        && typeof value.thumbnailUrl === 'string'
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
        const { assetId, uploadUrl } = await dashboardApi<{ assetId: string, uploadUrl: string }>(
          `${siteApiBase}/media/request-upload`,
          {
            method: 'POST',
            validate: validateApiShape({ assetId: 'string', uploadUrl: 'string' }),
            body: {
              filename: file.name,
              locationId: options.locationId,
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
          id: assetId,
          kind: 'image',
        }
      }

      const response = await dashboardApi<{
        id: string
        kind: 'video'
        publicUrl: string
        thumbnailUrl: null
      }>(`${siteApiBase}/media/upload`, {
        method: 'POST',
        body: file,
        headers: { 'content-type': file.type },
        query: {
          filename: file.name,
          locationId: options.locationId || undefined,
          category: options.category || undefined,
        },
        timeout: MEDIA_UPLOAD_TIMEOUT_MS,
        validate: (value): value is {
          id: string
          kind: 'video'
          publicUrl: string
          thumbnailUrl: null
        } => isRecord(value)
          && typeof value.id === 'string'
          && value.kind === 'video'
          && typeof value.publicUrl === 'string'
          && value.thumbnailUrl === null,
      })

      let thumbnailUrl: string | null = null
      if (options.poster) {
        const posterForm = new FormData()
        posterForm.append('poster', options.poster)
        try {
          const posterResponse = await dashboardApi<{ id: string; thumbnailUrl: string }>(
            `${siteApiBase}/media/${response.id}/poster`,
            {
              method: 'POST',
              body: posterForm,
              validate: (value): value is { id: string; thumbnailUrl: string } =>
                isRecord(value)
                && value.id === response.id
                && typeof value.thumbnailUrl === 'string',
            },
          )
          thumbnailUrl = posterResponse.thumbnailUrl
        } catch (posterError) {
          try {
            await cleanupPendingUpload(response.id)
          } catch (cleanupError) {
            throw operationAndCleanupError('Video poster upload failed', posterError, cleanupError)
          }
          throw posterError
        }
      }

      return {
        id: response.id,
        kind: response.kind,
        publicUrl: response.publicUrl,
        thumbnailUrl,
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
