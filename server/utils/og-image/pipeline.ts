import type { H3Event } from 'h3'
import ogImageFallbackBase64 from '~/server/assets/og-image-fallback'
import type { OgImageRenderPayload } from '~/utils/social-metadata'
import { computeOgImageCacheKey } from '~/utils/social-metadata'
import { renderOgImagePng } from './render.ts'

const KV_KEY_PREFIX = 'og-image:v1:'
// No content-edit-triggered purge exists yet for generated cards (unlike bootstrap-cache.ts's
// purgeBootstrapCache). 30 days bounds staleness for a title/description/hero-photo edit
// without needing that wiring immediately; revisit if editors report stale previews.
const KV_TTL_SECONDS = 60 * 60 * 24 * 30

export type OgImageSource = 'cache' | 'generated' | 'fallback'

export interface OgImagePipelineResult {
  bytes: Uint8Array
  contentType: string
  cacheKey: string
  source: OgImageSource
  fallbackReason?: 'renderer_error'
}

export interface ResolveOgImageDeps {
  render?: typeof renderOgImagePng
}

interface OgImageBindings {
  SITE_CACHE?: {
    get(_key: string, _type: 'arrayBuffer'): Promise<ArrayBuffer | null>
    put(_key: string, _value: ArrayBuffer, _options?: { expirationTtl?: number }): Promise<void>
  }
}

function getBindings(event: H3Event): OgImageBindings {
  return (event.context.cloudflare?.env as OgImageBindings | undefined) ?? {}
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

let cachedFallbackBytes: Uint8Array | null = null
function getFallbackBytes(): Uint8Array {
  if (!cachedFallbackBytes) cachedFallbackBytes = base64ToUint8Array(ogImageFallbackBase64)
  return cachedFallbackBytes
}

export function createFallbackOgImageResult(payload: OgImageRenderPayload): OgImagePipelineResult {
  return {
    bytes: getFallbackBytes(),
    contentType: 'image/png',
    cacheKey: computeOgImageCacheKey(payload),
    source: 'fallback',
  }
}

/**
 * The one image-generation/fallback/cache/response pipeline every OG image request goes
 * through (#259). Order: KV cache hit → render via satori+resvg (cached in KV on success)
 * → static shared fallback image if rendering throws. Never lets a broken render surface
 * as a 500 — a generic but valid card is always better than a missing/broken og:image.
 */
export async function resolveOgImage(
  event: H3Event,
  payload: OgImageRenderPayload,
  deps: ResolveOgImageDeps = {},
): Promise<OgImagePipelineResult> {
  const cacheKey = computeOgImageCacheKey(payload)
  const { SITE_CACHE } = getBindings(event)

  if (SITE_CACHE) {
    try {
      const cached = await SITE_CACHE.get(KV_KEY_PREFIX + cacheKey, 'arrayBuffer')
      if (cached) {
        return { bytes: new Uint8Array(cached), contentType: 'image/png', cacheKey, source: 'cache' }
      }
    } catch (error) {
      console.warn('[og-image] KV cache read failed, continuing to render', error)
    }
  }

  try {
    const bytes = await (deps.render ?? renderOgImagePng)(payload, {})
    if (SITE_CACHE) {
      try {
        const activeBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        await SITE_CACHE.put(KV_KEY_PREFIX + cacheKey, activeBytes, {
          expirationTtl: KV_TTL_SECONDS,
        })
      } catch (error) {
        console.warn('[og-image] KV cache write failed', error)
      }
    }
    return { bytes, contentType: 'image/png', cacheKey, source: 'generated' }
  } catch (error) {
    console.error('[og-image]', {
      stage: 'render',
      cacheKey,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    })
  }

  return { ...createFallbackOgImageResult(payload), fallbackReason: 'renderer_error' }
}
