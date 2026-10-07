import { computed } from 'vue'

export function useDashboardOrganizationLinks() {
  const dashboard = useDashboardOrganization()

  const orgPaths = computed(() => {
    const organizationSlug = dashboard.scope.value?.orgSlug
    const org = organizationSlug ? `/dashboard/${organizationSlug}` : '/dashboard'
    return { org, settings: `${org}/settings` }
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
      newLocation: `${organization}/locations/new`,
      posts: `${organization}/settings/posts`,
      pages: `${organization}/settings/website/pages`,
      blog: `${organization}/settings/website/blog`,
      qa: `${organization}/settings/website/qa`,
    }
  })

  return {
    orgPaths,
    organizationPaths,
  }
}
