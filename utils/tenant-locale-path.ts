// tenant_page_variants.path is stored locale-bare (the CMS writes the same
// '/', '/about', etc. for every translation) - a tenant route's first path
// segment is a locale prefix, not part of the page path, when it's a
// well-formed, already-canonical BCP-47 tag.
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
