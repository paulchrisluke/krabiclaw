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
  tenantFaviconUrl?: string | null
  tenantBrandName: string
  isDraftPreview: boolean
  isSitePreview?: boolean
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
  // Root-level icon requests cannot carry the tenant identity from a
  // platform-hosted site preview. Previews do not need app icons or manifests.
  if (options.isSitePreview) return []

  if (options.isPlatform) {
    return [...buildDefaultFaviconLinks(), { key: 'app-manifest', rel: 'manifest', href: '/site.webmanifest' }]
  }

  // Version hash: changes whenever the active icon source changes, busting browser cache.
  const versionSource = options.tenantFaviconUrl || options.tenantLogoUrl || options.tenantBrandName || 'default'
  const v = computeVersionHash(versionSource)

  const links: HeadLink[] = [
    { key: 'app-icon-tenant', rel: 'icon', href: `/tenant-icon?v=${v}` },
    { key: 'app-icon-shortcut', rel: 'shortcut icon', href: `/favicon.ico?v=${v}` },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: `/apple-touch-icon.png?v=${v}` },
  ]

  if (!options.isDraftPreview) {
    links.push({ key: 'app-manifest', rel: 'manifest', href: '/tenant.webmanifest' })
  }

  return links
}
