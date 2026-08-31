import { isLocalizedPublicAliasPath, LOCALE_ROUTE_SEGMENT } from '../shared/public-locale-routes'

export function localizedPublicRouteAliases<T extends { name?: string; path: string }>(pages: readonly T[]): T[] {
  return pages.flatMap((page) => {
    if (!page.name || !isLocalizedPublicAliasPath(page.path)) return []
    return [{
      ...page,
      name: `localized-${page.name}`,
      path: `/${LOCALE_ROUTE_SEGMENT}${page.path === '/' ? '' : page.path}`,
    }]
  })
}
