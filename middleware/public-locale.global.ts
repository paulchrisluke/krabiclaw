const SOURCE_ROUTE_ROOTS = new Set([
  'about', 'article', 'blog', 'contact', 'experiences', 'help', 'links', 'locations',
  'menu', 'order', 'photos', 'posts', 'privacy', 'products', 'qa', 'reservations',
  'reviews', 'services', 'terms',
])

export default defineNuxtRouteMiddleware((to) => {
  const first = to.path.split('/')[1] || ''
  const state = useState<string>('public-locale', () => 'en')
  if (!first || SOURCE_ROUTE_ROOTS.has(first) || ['admin', 'api', 'dashboard', 'preview'].includes(first)) {
    state.value = 'en'
    return
  }
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(first)) {
    state.value = 'en'
    return
  }
  try {
    const canonical = Intl.getCanonicalLocales(first)
    state.value = canonical.length === 1 && canonical[0] === first ? first : 'en'
  } catch {
    state.value = 'en'
  }
})
