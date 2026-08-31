import { isPublicSourceRouteRoot, RESERVED_PUBLIC_ROUTE_ROOTS } from '~/shared/public-locale-routes'

export default defineNuxtRouteMiddleware((to) => {
  const first = to.path.split('/')[1] || ''
  const state = useState<string>('public-locale', () => 'en')
  if (!first || isPublicSourceRouteRoot(first) || RESERVED_PUBLIC_ROUTE_ROOTS.has(first)) {
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
