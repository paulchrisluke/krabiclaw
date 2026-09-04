// tenant_page_variants.path is stored locale-bare (the CMS writes the same
// '/', '/about', etc. for every translation). Callers that classify public
// routes must use resolveTenantLocalePath with the tenant's published locales;
// splitLocalePrefix is reserved for syntax validation and normalization.
export interface TenantLocalePath {
  localeSegment: string | null
  sourcePath: string
  publicPath: string
}

export function splitLocalePrefix(path: string): TenantLocalePath {
  const first = path.split('/')[1]
  let localeSegment: string | null = null
  if (first && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(first)) {
    try {
      const canonical = Intl.getCanonicalLocales(first)
      if (canonical.length === 1 && canonical[0] === first) localeSegment = first
    } catch {
      localeSegment = null
    }
  }
  const sourcePath = localeSegment ? (path.slice(localeSegment.length + 1) || '/') : path
  return { localeSegment, sourcePath, publicPath: path }
}

export function formatTenantLocalePath(path: string, locale: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || locale === 'en') return path
  if (path === `/${locale}` || path.startsWith(`/${locale}/`)) return path
  if (path === '/') return `/${locale}`
  return `/${locale}${path}`
}

export function resolveTenantLocalePath(path: string, publishedLocales: readonly string[]): TenantLocalePath {
  const first = path.split('/')[1] ?? ''
  const localeSegment = publishedLocales.includes(first) ? first : null
  const sourcePath = localeSegment ? path.slice(localeSegment.length + 1) || '/' : path
  return { localeSegment, sourcePath, publicPath: path }
}
