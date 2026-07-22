import { setHeader, sendRedirect, getHeader, type H3Event } from 'h3'
import { sanitizeUrl } from '~/utils/sanitize'
import { isPlatformHost, type TenantHostEnv } from '~/server/utils/tenant-hosts'
import { cloudflareEnv } from '~/server/utils/api-response'

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

export function getCloudflareImageVariantUrl(url: string, width: number, height: number, format = 'png'): string {
  if (!url) return url
  if (url.includes('imagedelivery.net')) {
    return url.replace(/\/[a-zA-Z0-9_-]+$/, `/w=${width},h=${height},fit=pad,f=${format}`)
  }
  return url
}

export function getTenantFaviconSvg(brandName?: string | null, logoUrl?: string | null): string {
  if (logoUrl) {
    const escapedLogo = escapeXml(logoUrl)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><image href="${escapedLogo}" width="64" height="64" preserveAspectRatio="xMidYMid meet"/></svg>`
  }

  const name = brandName?.trim() || 'KrabiClaw'
  const letter = escapeXml(name.charAt(0).toUpperCase() || 'K')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#1F2547"/><text x="32" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="bold" fill="white">${letter}</text></svg>`
}

export interface FaviconOptions {
  platformFileName: string
  width?: number
  height?: number
  format?: string
  returnSvg?: boolean
}

export function handleFaviconRequest(event: H3Event, options: FaviconOptions) {
  const host = getHeader(event, 'host') || ''
  const env = cloudflareEnv(event)

  if (event.context.tenantType === 'PLATFORM' || isPlatformHost(host, env)) {
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

  setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')

  // Always return real SVG for SVG format requests
  if (options.returnSvg) {
    const targetImage = (faviconUrl && !isPlatformAssetUrl(faviconUrl, env)) ? faviconUrl : ((logoUrl && !isPlatformAssetUrl(logoUrl, env)) ? logoUrl : null)
    const svg = getTenantFaviconSvg(site?.brand_name, targetImage)
    setHeader(event, 'content-type', 'image/svg+xml')
    return svg
  }

  // 1. Configured tenant favicon (if present and not platform asset)
  if (faviconUrl && !isPlatformAssetUrl(faviconUrl, env)) {
    let target = faviconUrl
    if (options.width && options.height) {
      target = getCloudflareImageVariantUrl(target, options.width, options.height, options.format || 'png')
    }
    return sendRedirect(event, target, 302)
  }

  // 2. Tenant logo
  if (logoUrl && !isPlatformAssetUrl(logoUrl, env)) {
    let target = logoUrl
    if (options.width && options.height) {
      target = getCloudflareImageVariantUrl(target, options.width, options.height, options.format || 'png')
    }
    return sendRedirect(event, target, 302)
  }

  // 3. Fallback generated SVG initial
  const svg = getTenantFaviconSvg(site?.brand_name)
  setHeader(event, 'content-type', 'image/svg+xml')
  return svg
}
