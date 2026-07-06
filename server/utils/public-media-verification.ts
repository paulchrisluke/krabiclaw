interface VerificationError extends Error {
  retryable?: boolean
  status?: number
}

interface VerifyPublicMediaUrlOptions {
  attempts?: number
  fetchImpl?: typeof fetch
  retryDelaysMs?: number[]
  sleepImpl?: (_ms: number) => Promise<void>
  timeoutMs?: number
}

const DEFAULT_RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000]

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function createVerificationError(
  message: string,
  options: { retryable: boolean; status?: number },
): VerificationError {
  const error = new Error(message) as VerificationError
  error.retryable = options.retryable
  error.status = options.status
  return error
}

function isRetryableStatus(status: number): boolean {
  return status === 403
    || status === 404
    || status === 408
    || status === 429
    || (status >= 500 && status <= 504)
}

async function verifyPublicMediaUrlOnce(
  publicUrl: string,
  expectedContentType: string,
  options: Pick<VerifyPublicMediaUrlOptions, 'fetchImpl' | 'timeoutMs'> = {},
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3_000)
  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchImpl(publicUrl, {
      method: 'GET',
      headers: { range: 'bytes=0-0' },
      signal: controller.signal,
    })

    if (response.status !== 200 && response.status !== 206) {
      throw createVerificationError(
        `Public media URL returned HTTP ${response.status}`,
        { retryable: isRetryableStatus(response.status), status: response.status },
      )
    }

    const actualContentType = response.headers.get('content-type')?.split(';', 1)[0]?.toLowerCase()
    if (actualContentType && actualContentType !== expectedContentType) {
      throw createVerificationError(
        `Public media URL returned ${actualContentType}, expected ${expectedContentType}`,
        { retryable: false, status: response.status },
      )
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createVerificationError('Public media URL verification timed out', { retryable: true })
    }

    if (error instanceof Error && 'retryable' in error) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown public media URL verification error'
    throw createVerificationError(message, { retryable: true })
  } finally {
    clearTimeout(timeout)
  }
}

export async function assertPublicMediaUrl(
  publicUrl: string,
  expectedContentType: string,
  options: VerifyPublicMediaUrlOptions = {},
): Promise<void> {
  const attempts = Math.max(options.attempts ?? (options.retryDelaysMs?.length ?? DEFAULT_RETRY_DELAYS_MS.length) + 1, 1)
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const sleepImpl = options.sleepImpl ?? sleep

  let lastError: VerificationError | null = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await verifyPublicMediaUrlOnce(publicUrl, expectedContentType, options)
      return
    } catch (error) {
      lastError = error as VerificationError

      if (!lastError.retryable || attempt === attempts - 1) {
        throw lastError
      }

      const delayMs = retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)] ?? 0
      if (delayMs > 0) {
        await sleepImpl(delayMs)
      }
    }
  }

  throw lastError ?? new Error('Public media URL verification failed')
}
