type HeadLink = {
  key: string
  rel: string
  href: string
  type?: string
  sizes?: string
}

interface TenantHeadLinkOptions {
  isPlatform: boolean
  tenantLogoUrl: string | null
  tenantBrandName: string
  isDraftPreview: boolean
}

export function buildTenantHeadLinks(options: TenantHeadLinkOptions): HeadLink[] {
  if (options.isPlatform) {
    return [
      { key: 'app-icon-96', rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
      { key: 'app-icon-svg', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { key: 'app-icon-shortcut', rel: 'shortcut icon', href: '/favicon.ico' },
      { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { key: 'app-manifest', rel: 'manifest', href: '/site.webmanifest' },
    ]
  }

  if (options.tenantLogoUrl) {
    const links: HeadLink[] = [
      { key: 'app-icon-96', rel: 'icon', href: options.tenantLogoUrl, sizes: '96x96' },
      { key: 'app-icon-default', rel: 'icon', href: options.tenantLogoUrl },
      { key: 'app-icon-shortcut', rel: 'shortcut icon', href: options.tenantLogoUrl },
      { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: options.tenantLogoUrl },
    ]
    if (!options.isDraftPreview) {
      links.push({ key: 'app-manifest', rel: 'manifest', href: '/tenant.webmanifest' })
    }
    return links
  }

  const fallback = buildTenantFallbackIconDataUrl(options.tenantBrandName)
  const links: HeadLink[] = [
    { key: 'app-icon-svg', rel: 'icon', type: 'image/svg+xml', href: fallback },
    { key: 'app-icon-shortcut', rel: 'shortcut icon', href: fallback },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: fallback },
  ]

  if (!options.isDraftPreview) {
    links.push({ key: 'app-manifest', rel: 'manifest', href: '/tenant.webmanifest' })
  }

  return links
}

function buildTenantFallbackIconDataUrl(tenantBrandName: string): string {
  const trimmedName = tenantBrandName.trim()
  // Use Array.from to safely extract first Unicode code point (handles emoji, non-BMP chars)
  const firstCodePoint = Array.from(trimmedName)[0] || 'K'
  const letter = firstCodePoint.toUpperCase()
  const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  const safeLetter = letter.replace(/[&<>"']/g, (c: string) => escapeMap[c] ?? c)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#1F2547"/><text x="32" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="bold" fill="white">${safeLetter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
