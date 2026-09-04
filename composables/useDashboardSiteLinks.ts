import { computed } from 'vue'

interface DashboardLocationPathSource {
  slug: string
  is_primary: boolean
}

export function resolveDashboardPrimaryLocationPath(
  locations: readonly DashboardLocationPathSource[],
  locationsPath: string,
): string | null {
  const location = locations.find(item => item.is_primary) ?? locations[0]
  return location ? `${locationsPath}/${location.slug}` : null
}

export function resolveDashboardSitePageDestination(
  path: string,
  sitePath: string,
  primaryLocationPath: string | null,
): string | null {
  if (path === '/blog') return `${sitePath}/blog`
  if (path === '/order') return `${sitePath}/orders`
  if (['/services', '/pricing', '/donate', '/schedule'].includes(path)) return `${sitePath}/professional-services`
  if (path === '/menu' || path === '/products') return primaryLocationPath ? `${primaryLocationPath}/products` : null
  if (path === '/reservations') return primaryLocationPath ? `${primaryLocationPath}/reservations` : null
  if (path === '/experiences') return primaryLocationPath ? `${primaryLocationPath}/experiences` : null
  return `${sitePath}/pages`
}

export function useDashboardSiteLinks() {
  const dashboard = useDashboardSite()
  const dashboardLocation = useDashboardLocation()

  const orgPaths = computed(() => {
    const base = '/dashboard'
    const organizationSlug = dashboard.scope.value?.orgSlug
    const org = organizationSlug ? `${base}/${organizationSlug}` : base
    const settings = `${org}/settings`

    return {
      base,
      org,
      settings,
      settingsGeneral: `${settings}/general`,
      settingsBilling: `${settings}/billing`,
      accountProfile: `${base}/account/profile`,
    }
  })

  const sitePaths = computed(() => {
    const scope = dashboard.scope.value
    if (!scope?.siteSlug) return null

    const site = `/dashboard/${scope.orgSlug}/sites/${scope.siteSlug}`
    const settings = `${site}/settings`

    return {
      site,
      pages: `${site}/pages`,
      qa: `${site}/qa`,
      inbox: `${site}/inbox`,
      order: `${site}/orders`,
      media: `${site}/media`,
      locations: `${site}/locations`,
      domains: `${settings}/domains`,
      settings,
    }
  })

  const locationPaths = computed(() => {
    const site = sitePaths.value
    const locationSlug = dashboardLocation.currentLocationSlug.value
    if (!site || !locationSlug) return null

    const location = `${site.locations}/${locationSlug}`

    return {
      location,
      products: `${location}/products`,
      posts: `${location}/posts`,
      photos: `${location}/photos`,
      qa: `${location}/qa`,
      inbox: `${location}/inbox`,
      reservations: `${location}/reservations`,
      settings: `${location}/settings`,
    }
  })

  return {
    orgPaths,
    sitePaths,
    locationPaths,
  }
}
