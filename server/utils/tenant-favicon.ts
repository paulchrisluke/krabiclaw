import { createError, getHeader, sendStream, setHeader, sendRedirect, type H3Event } from 'h3'
import { sanitizeUrl } from '~/utils/sanitize'
import type { TenantHostEnv } from '~/server/utils/tenant-hosts'
import { cloudflareEnv } from '~/server/utils/api-response'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { getR2KeyFromPublicUrl } from '~/server/utils/cloudflare-r2'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

const PREVIEW_CACHE_CONTROL = 'private, no-store, max-age=0'

function setFaviconCacheControl(event: H3Event, cacheControl: string) {
  const host = getHeader(event, 'host') || ''
  setHeader(event, 'cache-control', isPreviewContext(host) ? PREVIEW_CACHE_CONTROL : cacheControl)
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function isPlatformAssetUrl(url: string | null | undefined, env?: TenantHostEnv): boolean {
  if (!url) return false
  const trimmed = url.trim()
  if (trimmed.startsWith('/platform/')) return true
  if (/^\/(?:favicon|apple-touch-icon|site\.webmanifest)/.test(trimmed)) return true

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed)
      const host = parsed.hostname
      const isPlatformDomain =
        host === 'krabiclaw.com' ||
        host === 'www.krabiclaw.com' ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        (env?.NUXT_PUBLIC_PLATFORM_DOMAIN && parsed.origin === env.NUXT_PUBLIC_PLATFORM_DOMAIN)

      if (isPlatformDomain) {
        return /^\/(?:favicon|apple-touch-icon|platform\/)/.test(parsed.pathname)
      }
    }
  } catch {
    // Ignore invalid URL parse errors
  }

  return false
}

/**
 * Returns true if the given URL is a Cloudflare Images delivery URL that supports
 * flexible variant parameters (width, height, format, fit).
 *
 * Requires an exact hostname match on `imagedelivery.net` so that lookalike
 * domains (`my-imagedelivery.net`, `imagedelivery.net.evil.com`) and URLs that
 * merely contain the string in their path or query string are not mis-classified.
 */
export function isCloudflareImagesUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'imagedelivery.net'
  } catch {
    return false
  }
}

/**
 * Applies Cloudflare Images flexible variant parameters to a delivery URL.
 * Only call after confirming isCloudflareImagesUrl() is true.
 *
 * Replaces the trailing variant segment (e.g. `/public`) with `/w=N,h=N,fit=pad,f=format`.
 * `fit=pad` ensures the image is contained in the requested square without distortion.
 */
export function getCloudflareImageVariantUrl(url: string, width: number, height: number, format: 'webp' | 'jpeg' = 'webp'): string {
  if (!url) return url
  return url.replace(/\/[a-zA-Z0-9_-]+$/, `/w=${width},h=${height},fit=pad,f=${format}`)
}

export function getTenantFaviconSvg(faviconUrl: string): string {
  const escapedUrl = escapeXml(faviconUrl)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><image href="${escapedUrl}" width="64" height="64" preserveAspectRatio="xMidYMid meet"/></svg>`
}

export interface FaviconOptions {
  platformFileName: string
  width?: number
  height?: number
  format?: 'webp' | 'jpeg'
  /** When true, return an SVG wrapper around the configured favicon source. */
  returnSvg?: boolean
}

async function serveR2Favicon(event: H3Event, env: ApiRecord, url: string) {
  const key = getR2KeyFromPublicUrl(env, url)
  if (!key) return null
  if (!env.MEDIA_BUCKET) throw createError({ statusCode: 503, statusMessage: 'Media storage unavailable' })
  const object = await env.MEDIA_BUCKET.get(key)
  if (!object) throw createError({ statusCode: 404, statusMessage: 'Tenant favicon not found' })
  setHeader(event, 'content-type', object.httpMetadata?.contentType || 'image/png')
  setHeader(event, 'content-length', object.size)
  setHeader(event, 'etag', object.etag)
  setFaviconCacheControl(event, 'public, max-age=31536000, immutable')
  return sendStream(event, object.body)
}

async function proxyFavicon(event: H3Event, url: string) {
  const response = await fetch(url, {
    headers: { accept: 'image/webp,image/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok || !response.body) {
    throw createError({ statusCode: 502, statusMessage: `Tenant favicon source failed (${response.status})` })
  }
  const responseType = response.headers.get('content-type')?.split(';', 1)[0]?.trim() || ''
  if (!responseType.startsWith('image/')) {
    throw createError({ statusCode: 502, statusMessage: 'Tenant favicon source returned a non-image response' })
  }
  setHeader(event, 'content-type', responseType)
  const length = response.headers.get('content-length')
  if (length) setHeader(event, 'content-length', Number(length))
  setFaviconCacheControl(event, 'public, max-age=3600, stale-while-revalidate=86400')
  return sendStream(event, response.body)
}

export async function handleFaviconRequest(event: H3Event, options: FaviconOptions) {
  const env = cloudflareEnv(event)

  if (event.context.tenantType === TENANT_TYPES.PLATFORM) {
    const cleanFileName = options.platformFileName.replace(/^\/platform\//, '').replace(/^\//, '')
    return sendRedirect(event, `/platform/${cleanFileName}`, 302)
  }

  const site = event.context.site as {
    brand_name?: string | null
    logo_url?: string | null
    logo_mime_type?: string | null
    favicon_url?: string | null
  } | undefined

  const faviconUrl = sanitizeUrl(site?.favicon_url)
  const logoUrl = sanitizeUrl(site?.logo_url)
  const sourceUrl = faviconUrl && !isPlatformAssetUrl(faviconUrl, env)
    ? faviconUrl
    : logoUrl && !isPlatformAssetUrl(logoUrl, env)
      ? logoUrl
      : null
  setFaviconCacheControl(event, 'public, max-age=3600, stale-while-revalidate=86400')

  if (options.returnSvg) {
    if (!sourceUrl) {
      throw createError({ statusCode: 404, statusMessage: 'Tenant favicon not configured' })
    }
    const svg = getTenantFaviconSvg(sourceUrl)
    setHeader(event, 'content-type', 'image/svg+xml')
    return svg
  }

  if (sourceUrl) {
    const r2Response = await serveR2Favicon(event, env, sourceUrl)
    if (r2Response) return r2Response
    if (options.width && options.height) {
      if (isCloudflareImagesUrl(sourceUrl)) {
        const target = getCloudflareImageVariantUrl(sourceUrl, options.width, options.height, options.format || 'webp')
        return proxyFavicon(event, target)
      }
      throw createError({ statusCode: 422, statusMessage: 'Tenant favicon is not managed media' })
    }
    return proxyFavicon(event, sourceUrl)
  }

  throw createError({ statusCode: 404, statusMessage: 'Tenant favicon not configured' })
}
