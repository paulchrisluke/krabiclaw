type HeadLink = {
  key: string
  rel: string
  href: string
  type?: string
  sizes?: string
}

export interface TenantHeadLinkOptions {
  isPlatform: boolean
  tenantLogoUrl: string | null
  tenantLogoMimeType?: string | null
  tenantFaviconUrl?: string | null
  tenantFaviconMimeType?: string | null
  tenantBrandName: string
  isDraftPreview: boolean
}

function buildDefaultFaviconLinks(): HeadLink[] {
  return [
    { key: 'app-icon-96', rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
    { key: 'app-icon-svg', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { key: 'app-icon-shortcut', rel: 'shortcut icon', href: '/favicon.ico' },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
  ]
}

function computeVersionHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function mimeTypeFromUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  const lower = url.toLowerCase()
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.ico')) return 'image/x-icon'
  return undefined
}

export function buildTenantHeadLinks(options: TenantHeadLinkOptions): HeadLink[] {
  if (options.isPlatform) {
    return [...buildDefaultFaviconLinks(), { key: 'app-manifest', rel: 'manifest', href: '/site.webmanifest' }]
  }

  // Version hash: changes whenever the active icon source changes, busting browser cache.
  const versionSource = options.tenantFaviconUrl || options.tenantLogoUrl || options.tenantBrandName || 'default'
  const v = computeVersionHash(versionSource)

  // Determine effective MIME type based on which source is actually active.
  // If a dedicated favicon is configured, its MIME type wins; fall back to the
  // logo MIME type only when no favicon is configured. Never let logo's type
  // apply to an icon that is served from the favicon URL.
  let iconType: string | undefined
  if (options.tenantFaviconUrl) {
    // Dedicated favicon is active – use its explicit type, then extension fallback.
    iconType = options.tenantFaviconMimeType || mimeTypeFromUrl(options.tenantFaviconUrl)
    // If the favicon source type cannot be determined, omit the type attribute
    // rather than silently inheriting the logo's type.
  } else if (options.tenantLogoUrl) {
    // Logo is used as the icon source.
    iconType = options.tenantLogoMimeType || mimeTypeFromUrl(options.tenantLogoUrl)
  }

  const links: HeadLink[] = [
    { key: 'app-icon-tenant', rel: 'icon', ...(iconType ? { type: iconType } : {}), href: `/tenant-icon?v=${v}` },
    { key: 'app-icon-shortcut', rel: 'shortcut icon', href: `/favicon.ico?v=${v}` },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: `/apple-touch-icon.png?v=${v}` },
  ]

  if (!options.isDraftPreview) {
    links.push({ key: 'app-manifest', rel: 'manifest', href: '/tenant.webmanifest' })
  }

  return links
}
