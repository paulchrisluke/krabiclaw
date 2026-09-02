export const PUBLIC_SOURCE_ROUTE_ROOTS = new Set([
  'about', 'article', 'blog', 'contact', 'experiences', 'help', 'links', 'locations',
  'menu', 'order', 'photos', 'posts', 'privacy', 'products', 'qa', 'reservations',
  'reviews', 'services', 'terms',
])

export const RESERVED_PUBLIC_ROUTE_ROOTS = new Set(['admin', 'api', 'dashboard', 'preview'])

export function isPublicSourceRouteRoot(value: string): boolean {
  return PUBLIC_SOURCE_ROUTE_ROOTS.has(value)
}

export function isLocalizedPublicAliasPath(path: string): boolean {
  if (path === '/') return true
  const root = path.split('/')[1]
  return Boolean(root && isPublicSourceRouteRoot(root))
}
