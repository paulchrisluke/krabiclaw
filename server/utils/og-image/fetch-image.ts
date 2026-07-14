/**
 * Fetches a remote image and inlines it as a data: URI so satori can composite it into
 * a rendered OG card. Satori does not fetch remote `src` URLs itself — it only accepts
 * already-resolved image buffers/data URIs — so this step is required for hero-image
 * backgrounds and logos.
 *
 * Never throws: any failure (network, timeout, non-image response, oversized payload)
 * resolves to null so the renderer can fall back to a solid brand-color background
 * rather than failing the whole OG image response.
 */
export interface FetchImageOptions {
  timeoutMs?: number
  maxBytes?: number
}

const DEFAULT_TIMEOUT_MS = 4000
const DEFAULT_MAX_BYTES = 5_000_000

export async function fetchImageAsDataUri(
  url: string | null | undefined,
  options: FetchImageOptions = {},
): Promise<string | null> {
  if (!url) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || ''
    if (!contentType.startsWith('image/')) return null

    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) return null

    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) return null

    return `data:${contentType};base64,${uint8ArrayToBase64(buffer)}`
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}
