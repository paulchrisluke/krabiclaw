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
  tenantBrandName: string
  isDraftPreview: boolean
  tenantFaviconUrl?: string | null
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

export function buildTenantHeadLinks(options: TenantHeadLinkOptions): HeadLink[] {
  if (options.isPlatform) {
    return [...buildDefaultFaviconLinks(), { key: 'app-manifest', rel: 'manifest', href: '/site.webmanifest' }]
  }

  const versionSource = options.tenantFaviconUrl || options.tenantLogoUrl || options.tenantBrandName || 'default'
  const v = computeVersionHash(versionSource)

  const targetUrl = options.tenantFaviconUrl || options.tenantLogoUrl
  let iconType: string | undefined

  if (options.tenantLogoMimeType) {
    iconType = options.tenantLogoMimeType
  } else if (targetUrl) {
    const lower = targetUrl.toLowerCase()
    if (lower.endsWith('.svg')) iconType = 'image/svg+xml'
    else if (lower.endsWith('.png')) iconType = 'image/png'
    else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) iconType = 'image/jpeg'
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
