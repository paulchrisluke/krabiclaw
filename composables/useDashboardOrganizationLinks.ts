import { computed } from 'vue'

export function useDashboardOrganizationLinks() {
  const dashboard = useDashboardOrganization()

  const orgPaths = computed(() => {
    const base = '/dashboard'
    const organizationSlug = dashboard.scope.value?.orgSlug
    const org = organizationSlug ? `${base}/${organizationSlug}` : base
    const settings = `${org}/settings`

    return {
      base,
      org,
      settings,
      accountProfile: `${base}/account/profile`,
    }
  })

  /**
   * The organization's own screens. There used to be two builders here — one
   * keyed on the site's subdomain, one on a `organizationSlug` route param —
   * producing nearly the same paths from the same organization. The tenant is
   * the organization, so there is one.
   */
  const organizationPaths = computed(() => {
    const organizationSlug = dashboard.scope.value?.orgSlug
    if (!organizationSlug) return null
    const organization = `/dashboard/${organizationSlug}`
    return {
      catalog: `${organization}/products`,
      locations: `${organization}/locations`,
      newLocation: `${organization}/locations/new`,
      posts: `${organization}/posts`,
      pages: `${organization}/pages`,
      blog: `${organization}/blog`,
      qa: `${organization}/qa`,
    }
  })

  return {
    orgPaths,
    organizationPaths,
  }
}
