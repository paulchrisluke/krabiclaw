// Computes bootstrap params from the current route.
// Used by pages, SayaHeader, and SayaFooter so they all register the same
// useFetch key — Nuxt deduplicates to a single SSR request.
//
// Page type → SSR call mapping:
//   /locations/[slug]/reviews  → type A  (reviews data included)
//   /locations                 → type B
//   /locations/[slug]          → type C  (menu preview + reviews preview)
//   regular pages (/, /about…) → type D
//   /locations/[slug]/photos   → type E  (photos data included)
//   /locations/[slug]/qa       → type F  (qa data included)
export interface BootstrapParams {
  page: string | null
  location: string | null
  menu: boolean
  data: string | null  // 'reviews' | 'photos' | 'qa' — triggers full dataset in bootstrap
}

export const useBootstrapParams = (): BootstrapParams => {
  const route = useRoute()

  const path = route.path

  // Location sub-pages: /locations/[slug]/*
  const locationMatch = path.match(/^\/locations\/([^/]+)/)
  if (locationMatch) {
    const slug = locationMatch[1]
    const segments = path.split('/')
    const sub = segments.length > 3 ? segments[3] : undefined
    const page = sub || 'location'
    const includeMenu = page === 'location' || page === 'menu'
    const fullData = (page === 'reviews' || page === 'photos' || page === 'qa') ? page : null
    return { page, location: slug ?? null, menu: includeMenu, data: fullData }
  }

  // Top-level pages
  if (path === '/' || path === '') return { page: 'home', location: null, menu: true, data: null }
  if (path.startsWith('/locations')) return { page: 'locations', location: null, menu: true, data: null }
  if (path.startsWith('/about')) return { page: 'about', location: null, menu: false, data: null }
  if (path.startsWith('/contact')) return { page: 'contact', location: null, menu: false, data: null }
  if (path.startsWith('/reservations')) return { page: 'reservations', location: null, menu: false, data: null }
  if (path.startsWith('/order')) return { page: 'order', location: null, menu: false, data: null }
  if (path.startsWith('/qa')) return { page: 'qa', location: null, menu: false, data: 'qa' }
  if (path.startsWith('/reviews')) return { page: 'reviews', location: null, menu: false, data: null }
  if (path.startsWith('/posts')) return { page: 'posts', location: null, menu: false, data: null }
  if (path.startsWith('/experiences')) return { page: 'experiences', location: null, menu: false, data: null }
  if (path.startsWith('/photos')) return { page: 'photos', location: null, menu: false, data: null }

  return { page: null, location: null, menu: false, data: null }
}

export const useBootstrapKey = (siteId: string | null | undefined, params: BootstrapParams) =>
  `bs-${siteId ?? 'none'}-${params.page ?? ''}-${params.location ?? ''}-${params.menu ? 'm' : ''}-${params.data ?? ''}`

export const useBootstrapUrl = (siteId: string | null | undefined, params: BootstrapParams) => {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', params.page)
  if (params.location) qs.set('location', params.location)
  if (params.menu) qs.set('menu', '1')
  if (params.data) qs.set('data', params.data)
  const q = qs.toString()
  return `/api/public/sites/${siteId}/bootstrap${q ? `?${q}` : ''}`
}
