import { computed } from 'vue'

export function useDashboardOrganizationLinks() {
  const dashboard = useDashboardOrganization()

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
      newLocation: `${organization}/locations/new`,
      posts: `${organization}/posts`,
      pages: `${organization}/website/pages`,
      blog: `${organization}/website/blog`,
      qa: `${organization}/website/qa`,
    }
  })

  return { organizationPaths }
}
