import { computed } from 'vue'

export function useDashboardOrganizationLinks() {
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
   * on the site's subdomain, one on a `organizationSlug` route param — producing nearly
   * the same paths from the same organization. The tenant is the organization,
   * so there is one.
   */
  const businessPaths = computed(() => {
    const organizationSlug = dashboard.scope.value?.orgSlug
    if (!organizationSlug) return null
    const organization = `/dashboard/${organizationSlug}`
    const settings = `${organization}/settings`
    return {
      organization,
      locations: `${organization}/locations`,
      newLocation: `${organization}/locations/new`,
      pages: `${organization}/pages`,
      blog: `${organization}/blog`,
      qa: `${organization}/qa`,
      brand: `${organization}/brand`,
      inbox: `${organization}/messages`,
      domains: `${settings}/website/domains`,
    }
  })

  const locationPaths = computed(() => {
    const organization = businessPaths.value
    const locationSlug = dashboardLocation.currentLocationSlug.value
    if (!organization || !locationSlug) return null

    const location = `${organization.locations}/${locationSlug}`

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
