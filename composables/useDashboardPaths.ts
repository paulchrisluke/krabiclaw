// Strict route-derived paths for navbar back controls.
//
// Deliberately has no fallbacks. useDashboardSiteLinks degrades a missing site
// to the organization path, which is how a wrong-but-plausible destination ends
// up in a back button instead of an error. Here, asking for a level the current
// route does not have is a bug, and throws where it happens rather than
// resolving to somewhere else.
//
// A page only asks for the level it actually sits under, so a throw means the
// page is mounted on a route that cannot contain it.
function requireParam(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`useDashboardPaths: route has no ${name}; this page cannot resolve its parent`)
  }
  return encodeURIComponent(value)
}

export function useDashboardPaths() {
  const route = useRoute()

  const organizationPath = computed(() => `/dashboard/${requireParam(route.params.orgSlug, 'orgSlug')}`)
  const sitePath = computed(() => `${organizationPath.value}/sites/${requireParam(route.params.siteSlug, 'siteSlug')}`)
  const locationPath = computed(() => `${sitePath.value}/locations/${requireParam(route.params.locationSlug, 'locationSlug')}`)

  return { organizationPath, sitePath, locationPath }
}
