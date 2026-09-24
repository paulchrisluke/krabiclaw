type HeadLink =
  | { key: string; rel: 'icon'; href: string; type?: string }
  | { key: string; rel: 'apple-touch-icon'; href: string }

export interface TenantHeadLinkOptions {
  isPlatform: boolean
  organizationMedia?: Array<{ slot: string; public_url: string | null }> | null
}

export function buildTenantHeadLinks(options: TenantHeadLinkOptions): HeadLink[] {
  const tenantFaviconUrl = !options.isPlatform
    ? options.organizationMedia?.find(item => item.slot === 'favicon')?.public_url
    : null

  // A tenant that uploaded a favicon gets that one file and nothing of ours.
  if (tenantFaviconUrl) {
    return [
      { key: 'app-icon', rel: 'icon', href: tenantFaviconUrl },
      { key: 'app-icon-apple', rel: 'apple-touch-icon', href: tenantFaviconUrl },
    ]
  }

  // Everyone else falls back to the KrabiClaw mark. The SVG is the canonical
  // symbol and stays crisp at every tab size; the ICO is only here for
  // browsers that do not take an SVG favicon.
  return [
    { key: 'app-icon-svg', rel: 'icon', type: 'image/svg+xml', href: '/platform/krabiclaw-symbol.svg' },
    { key: 'app-icon', rel: 'icon', href: '/platform/favicon.ico' },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', href: '/platform/apple-touch-icon.png' },
  ]
}
