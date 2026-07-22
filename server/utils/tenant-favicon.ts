import { setHeader, sendRedirect, getHeader, type H3Event } from 'h3'
import { sanitizeUrl } from '~/utils/sanitize'
import { isPlatformHost } from '~/server/utils/tenant-hosts'
import { cloudflareEnv } from '~/server/utils/api-response'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function isPlatformAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return (
    lower.endsWith('/favicon.ico') ||
    lower.endsWith('/favicon.svg') ||
    lower.endsWith('/apple-touch-icon.png') ||
    lower.endsWith('/favicon-96x96.png') ||
    lower.includes('/platform/')
  )
}

export function getTenantFaviconSvg(brandName?: string | null): string {
  const name = brandName?.trim() || 'KrabiClaw'
  const letter = escapeXml(name.charAt(0).toUpperCase() || 'K')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#1F2547"/><text x="32" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="bold" fill="white">${letter}</text></svg>`
}

export function handleFaviconRequest(event: H3Event, platformFileName: string) {
  const host = getHeader(event, 'host') || ''
  const env = cloudflareEnv(event)

  if (event.context.tenantType === 'PLATFORM' || isPlatformHost(host, env)) {
    const cleanFileName = platformFileName.replace(/^\/platform\//, '').replace(/^\//, '')
    return sendRedirect(event, `/platform/${cleanFileName}`, 302)
  }

  const site = event.context.site as { favicon_url?: string | null; logo_url?: string | null; brand_name?: string | null } | undefined
  const faviconUrl = sanitizeUrl(site?.favicon_url)
  const logoUrl = sanitizeUrl(site?.logo_url)

  setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')

  // 1. Configured tenant favicon (if present and not platform asset)
  if (faviconUrl && !isPlatformAssetUrl(faviconUrl)) {
    return sendRedirect(event, faviconUrl, 302)
  }

  // 2. Tenant logo
  if (logoUrl && !isPlatformAssetUrl(logoUrl)) {
    return sendRedirect(event, logoUrl, 302)
  }

  // 3. Fallback generated SVG initial
  const svg = getTenantFaviconSvg(site?.brand_name)
  setHeader(event, 'content-type', 'image/svg+xml')
  return svg
}
