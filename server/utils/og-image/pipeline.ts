import type { H3Event } from 'nitro'
import type { OgImageRenderPayload } from '~/utils/social-metadata'
import { computeOgImageCacheKey } from '~/utils/social-metadata'
import { renderOgImagePng } from './render.ts'

const KV_KEY_PREFIX = 'og-image:v1:'
// No content-edit-triggered purge exists yet for generated cards (unlike the public resource cache's
// purgePublicResourceCache). 30 days bounds staleness for a title/description/hero-photo edit
// without needing that wiring immediately; revisit if editors report stale previews.
const KV_TTL_SECONDS = 60 * 60 * 24 * 30

export type OgImageSource = 'cache' | 'generated'

export interface OgImagePipelineResult {
  bytes: Uint8Array
  contentType: string
  cacheKey: string
  source: OgImageSource
}

export interface ResolveOgImageDeps {
  render?: typeof renderOgImagePng
}

interface OgImageBindings {
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
  SITE_CACHE?: {
    get(_key: string, _type: 'arrayBuffer'): Promise<ArrayBuffer | null>
    put(_key: string, _value: ArrayBuffer, _options?: { expirationTtl?: number }): Promise<void>
  }
}

function getBindings(event: H3Event): OgImageBindings {
  return (event.req.runtime?.cloudflare?.env as OgImageBindings | undefined) ?? {}
}

/** The one image-generation/cache/response pipeline every OG image request goes through. */
export async function resolveOgImage(
  event: H3Event,
  payload: OgImageRenderPayload,
  deps: ResolveOgImageDeps = {},
): Promise<OgImagePipelineResult> {
  const cacheKey = computeOgImageCacheKey(payload)
  const { SITE_CACHE, NUXT_PUBLIC_PLATFORM_DOMAIN } = getBindings(event)

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
    const bytes = await (deps.render ?? renderOgImagePng)(payload, {
      platformDomain: NUXT_PUBLIC_PLATFORM_DOMAIN,
    })
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
    throw error
  }
}
