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
      settingsBilling: `${settings}/billing`,
      accountProfile: `${base}/account/profile`,
    }
  })

  /**
   * The business's site. Every organization has exactly one, so its paths are
   * known from any dashboard route, not only from under `/sites/:siteSlug`.
   */
  const businessPaths = computed(() => {
    const organizationSlug = dashboard.scope.value?.orgSlug
    const subdomain = dashboard.sites.value[0]?.subdomain
    if (!organizationSlug || !subdomain) return null
    const site = `/dashboard/${organizationSlug}/sites/${subdomain}`
    return {
      site,
      locations: `/dashboard/${organizationSlug}/sites`,
      newLocation: `${site}/locations/new`,
      pages: `${site}/pages`,
      blog: `${site}/blog`,
      qa: `${site}/qa`,
      brand: `${site}/brand`,
      settings: `${site}/settings`,
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
      inbox: `${site}/messages`,
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
      experiences: `${location}/experiences`,
      posts: `${location}/posts`,
      photos: `${location}/photos`,
      qa: `${location}/qa`,
      settings: `${location}/settings`,
    }
  })

  return {
    orgPaths,
    businessPaths,
    sitePaths,
    locationPaths,
  }
}
