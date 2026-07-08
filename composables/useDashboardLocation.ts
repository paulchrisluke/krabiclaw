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

  const preferredLocation = computed(() => dashboard.selectedLocation.value)

  const currentLocation = computed(() =>
    inLocationWorkspace.value ? routeLocation.value : preferredLocation.value
  )

  const currentLocationId = computed(() => currentLocation.value?.id ?? null)
  const currentLocationSlug = computed(() => currentLocation.value?.slug ?? routeLocationSlug.value ?? null)

  function buildLocationWorkspacePath(locationIdOrSlug: string) {
    const target = dashboard.locations.value.find((location) =>
      location.id === locationIdOrSlug || location.slug === locationIdOrSlug
    )
    const targetSlug = target?.slug ?? locationIdOrSlug
    const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
    const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null

    const parts = route.path.split('/').filter(Boolean)
    const sitesIndex = parts.findIndex((part, i) => 
      part === 'sites' && 
      (orgSlug ? parts[i - 1] === orgSlug : true) && 
      (siteSlug ? parts[i + 1] === siteSlug : true)
    )

    if (sitesIndex !== -1 && parts.length > sitesIndex + 2) {
      parts[sitesIndex + 2] = targetSlug
      return `/${parts.join('/')}`
    }

    if (orgSlug && siteSlug) return `/dashboard/${orgSlug}/sites/${siteSlug}/${targetSlug}`
    return route.path
  }

  async function selectLocation(locationIdOrSlug: string, options: { replace?: boolean; persistPreference?: boolean } = {}) {
    const target = dashboard.locations.value.find((location) =>
      location.id === locationIdOrSlug || location.slug === locationIdOrSlug
    )
    if (!target) return

    if (inLocationWorkspace.value) {
      const query = { ...route.query }
      delete query.locationId
      const to = { path: buildLocationWorkspacePath(target.slug), query }
      if (options.replace) await router.replace(to)
      else await router.push(to)

      if (options.persistPreference !== false && dashboard.selectedLocation.value?.id !== target.id) {
        await dashboard.selectLocation(target.id)
      }
      return
    }

    if (options.persistPreference !== false && dashboard.selectedLocation.value?.id !== target.id) {
      await dashboard.selectLocation(target.id)
    }
  }

  return {
    routeLocationSlug,
    inLocationWorkspace,
    routeLocation,
    preferredLocation,
    currentLocation,
    currentLocationId,
    currentLocationSlug,
    buildLocationWorkspacePath,
    selectLocation,
  }
}
