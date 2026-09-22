import { computed } from 'vue'

export function useDashboardSiteLinks() {
  const dashboard = useDashboardOrganization()
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
   * The business's own screens. There used to be two builders here — one keyed
   * on the site's subdomain, one on a `siteSlug` route param — producing nearly
   * the same paths from the same organization. The tenant is the organization,
   * so there is one.
   */
  const businessPaths = computed(() => {
    const organizationSlug = dashboard.scope.value?.orgSlug
    if (!organizationSlug) return null
    const site = `/dashboard/${organizationSlug}`
    const settings = `${site}/settings`
    return {
      site,
      locations: `${site}/locations`,
      newLocation: `${site}/locations/new`,
      pages: `${site}/pages`,
      blog: `${site}/blog`,
      qa: `${site}/qa`,
      brand: `${site}/brand`,
      inbox: `${site}/messages`,
      domains: `${settings}/website/domains`,
      settings,
    }
  })

  const locationPaths = computed(() => {
    const site = businessPaths.value
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
    locationPaths,
  }
}
