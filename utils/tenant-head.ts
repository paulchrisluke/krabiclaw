type HeadLink =
  | { key: string; rel: 'icon'; href: string }
  | { key: string; rel: 'apple-touch-icon'; href: string }

export interface TenantHeadLinkOptions {
  isPlatform: boolean
  siteMedia?: Array<{ slot: string; public_url: string | null }> | null
  isSitePreview?: boolean
}

export function buildTenantHeadLinks(options: TenantHeadLinkOptions): HeadLink[] {
  if (options.isSitePreview) return []

  const tenantFaviconUrl = !options.isPlatform
    ? options.siteMedia?.find(item => item.slot === 'favicon')?.public_url
    : null

  return [
    { key: 'app-icon', rel: 'icon', href: tenantFaviconUrl || '/platform/favicon.ico' },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', href: tenantFaviconUrl || '/platform/apple-touch-icon.png' },
  ]
}
