import { computed } from 'vue'

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
