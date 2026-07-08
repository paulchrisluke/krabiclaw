export default defineNuxtRouteMiddleware(async (to) => {
  const dashboard = useDashboardSite()
  const canonicalizingLegacyRoute = useState<boolean>('dashboard:location:canonicalizing-legacy-route', () => false)
  
  // Only apply to dashboard location routes
  if (!to.path.match(/^\/dashboard\/[^/]+\/sites\/[^/]+\/[^/]+/)) return
  
  const locationSlug = to.params.locationSlug
  if (typeof locationSlug !== 'string') return
  
  // Check if this is a legacy ID (not a slug)
  const routeLocation = dashboard.locations.value.find(loc => loc.slug === locationSlug)
  if (routeLocation) return // Already a valid slug
  
  const legacyLocation = dashboard.locations.value.find(loc => loc.id === locationSlug)
  if (!legacyLocation) return // Not a legacy ID either
  
  // Prevent infinite loops
  if (canonicalizingLegacyRoute.value) return
  canonicalizingLegacyRoute.value = true
  
  try {
    const orgSlug = to.params.orgSlug
    const siteSlug = to.params.siteSlug
    if (typeof orgSlug !== 'string' || typeof siteSlug !== 'string') return
    
    const newPath = `/dashboard/${orgSlug}/sites/${siteSlug}/${legacyLocation.slug}`
    
    // Preserve query params except locationId
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(to.query)) {
      if (key !== 'locationId' && typeof value === 'string') {
        query.set(key, value)
      }
    }
    const queryString = query.toString()
    const fullPath = queryString ? `${newPath}?${queryString}` : newPath
    
    return navigateTo(fullPath, { redirectCode: 301 })
  } finally {
    canonicalizingLegacyRoute.value = false
  }
})
