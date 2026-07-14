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

function buildDefaultFaviconLinks(): HeadLink[] {
  return [
    { key: 'app-icon-96', rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
    { key: 'app-icon-svg', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { key: 'app-icon-shortcut', rel: 'shortcut icon', href: '/favicon.ico' },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
  ]
}

export function buildTenantHeadLinks(options: TenantHeadLinkOptions): HeadLink[] {
  if (options.isPlatform) {
    return [...buildDefaultFaviconLinks(), { key: 'app-manifest', rel: 'manifest', href: '/site.webmanifest' }]
  }

  const links: HeadLink[] = [
    { key: 'app-icon-tenant', rel: 'icon', type: 'image/svg+xml', href: '/tenant-icon.svg' },
  ]

  if (!options.isDraftPreview) {
    links.push({ key: 'app-manifest', rel: 'manifest', href: '/tenant.webmanifest' })
  }

  return links
}
