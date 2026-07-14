import { setHeader, sendRedirect } from 'h3'
import { sanitizeUrl } from '~/utils/sanitize'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default defineEventHandler((event) => {
  const site = event.context.site as { favicon_url?: string | null; logo_url?: string | null; brand_name?: string | null } | undefined
  const faviconUrl = sanitizeUrl(site?.favicon_url)
  const logoUrl = sanitizeUrl(site?.logo_url)

  if (faviconUrl) {
    return sendRedirect(event, faviconUrl, 302)
  }

  if (logoUrl) {
    return sendRedirect(event, logoUrl, 302)
  }

  const brandName = site?.brand_name?.trim() || 'KrabiClaw'
  const letter = escapeXml(brandName.charAt(0).toUpperCase() || 'K')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#1F2547"/><text x="32" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="bold" fill="white">${letter}</text></svg>`

  setHeader(event, 'content-type', 'image/svg+xml')
  setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  setHeader(event, 'x-robots-tag', 'noindex')

  return svg
})
