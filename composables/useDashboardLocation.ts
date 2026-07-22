export function useDashboardLocation() {
  const dashboard = useDashboardSite()
  const route = useRoute()
  const router = useRouter()

  const routeLocationSlug = computed(() => {
    const slug = route.params.locationSlug
    return typeof slug === 'string' ? slug : null
  })

  const inLocationWorkspace = computed(() => Boolean(routeLocationSlug.value))

  const routeLocation = computed(() => {
    if (!routeLocationSlug.value) return null
    return dashboard.locations.value.find(location => location.slug === routeLocationSlug.value) ?? null
  })

  const currentLocation = computed(() => routeLocation.value)

  const currentLocationId = computed(() => currentLocation.value?.id ?? null)
  const currentLocationSlug = computed(() => currentLocation.value?.slug ?? routeLocationSlug.value ?? null)

  function buildLocationWorkspacePath(locationIdOrSlug: string) {
    const target = dashboard.locations.value.find((location) =>
      location.id === locationIdOrSlug || location.slug === locationIdOrSlug
    )
    const targetSlug = target?.slug ?? locationIdOrSlug
    const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
    const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null

    if (inLocationWorkspace.value && typeof route.name === 'string') {
      return router.resolve({
        name: route.name,
        params: { ...route.params, locationSlug: targetSlug },
        query: route.query,
      }).fullPath
    }

    if (orgSlug && siteSlug) return `/dashboard/${orgSlug}/sites/${siteSlug}/locations/${targetSlug}`
    return '/dashboard'
  }

  async function selectLocation(locationIdOrSlug: string, options: { replace?: boolean } = {}) {
    const target = dashboard.locations.value.find((location) =>
      location.id === locationIdOrSlug || location.slug === locationIdOrSlug
    )
    if (!target) return

    const to = buildLocationWorkspacePath(target.slug)
    if (options.replace) await router.replace(to)
    else await router.push(to)
  }

  return {
    routeLocationSlug,
    inLocationWorkspace,
    routeLocation,
    currentLocation,
    currentLocationId,
    currentLocationSlug,
    buildLocationWorkspacePath,
    selectLocation,
  }
}
