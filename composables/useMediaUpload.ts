export const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024

const CONFIRM_RETRY_DELAYS_MS = [250, 500]

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
  kind: 'image' | 'video' | 'file'
  publicUrl?: string | null
  thumbnailUrl?: string | null
  posterWarning?: string | null
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

function getErrorStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 0

  const errorRecord = error as Record<string, unknown>
  const statusCode = errorRecord.statusCode
  if (typeof statusCode === 'number') return statusCode

  const status = errorRecord.status
  if (typeof status === 'number') return status

  const data = errorRecord.data
  if (data && typeof data === 'object') {
    const dataStatusCode = (data as Record<string, unknown>).statusCode
    if (typeof dataStatusCode === 'number') return dataStatusCode
  }

  return 0
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function useMediaUpload(siteApiBase: string) {
  const uploading = ref(false)
  const error = ref<string | null>(null)
  const pendingRetryFile = ref<PendingMediaUpload | null>(null)

  async function cleanupPendingUpload(assetId: string) {
    await $fetch(`${siteApiBase}/media/${assetId}`, { method: 'DELETE' })
  }

  async function confirmPendingUpload(assetId: string) {
    let lastError: unknown = null

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await $fetch(`${siteApiBase}/media/${assetId}/confirm`, { method: 'POST' })
        return
      } catch (uploadError) {
        lastError = uploadError
        const status = getErrorStatus(uploadError)
        if (status === 409) return

        const retryDelay = CONFIRM_RETRY_DELAYS_MS[attempt]
        if (retryDelay !== undefined && (!status || status >= 500 || status === 408 || status === 429)) {
          await sleep(retryDelay)
          continue
        }

        break
      }
    }

    throw lastError ?? new Error('Failed to confirm uploaded file.')
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
        const { assetId, uploadUrl } = await $fetch<{ assetId: string, uploadUrl: string }>(
          `${siteApiBase}/media/request-upload`,
          {
            method: 'POST',
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
          const response = await fetch(uploadUrl, { method: 'POST', body: form })
          if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
        } catch (uploadError) {
          await cleanupPendingUpload(assetId).catch(() => {})
          throw uploadError
        }

        try {
          await confirmPendingUpload(assetId)
        } catch (uploadError) {
          await cleanupPendingUpload(assetId).catch(() => {})
          pendingRetryFile.value = { file, options }
          throw uploadError
        }

        return {
          id: assetId,
          kind: 'image',
        }
      }

      const form = new FormData()
      form.append('file', file)
      if (options.locationId) form.append('locationId', options.locationId)
      if (options.category) form.append('category', options.category)
      if (options.poster) form.append('poster', options.poster)

      const response = await $fetch<{
        id: string
        kind: 'video' | 'file'
        publicUrl: string | null
        thumbnailUrl: string | null
        posterWarning?: string | null
      }>(`${siteApiBase}/media/upload`, {
        method: 'POST',
        body: form
      })

      return {
        id: response.id,
        kind: response.kind,
        publicUrl: response.publicUrl,
        thumbnailUrl: response.thumbnailUrl,
        posterWarning: response.posterWarning ?? null,
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
