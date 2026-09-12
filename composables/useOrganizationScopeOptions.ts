import type { Ref } from 'vue'

export interface OrgSiteSummary { id: string; team_id: string | null; brand_name: string | null; subdomain: string | null }
export interface OrgLocationSummary { id: string; team_id: string | null; title: string }

const isSitesResponse = (value: unknown): value is { sites: OrgSiteSummary[] } =>
  isRecord(value)
  && Array.isArray(value.sites)
  && value.sites.every(site => isRecord(site) && typeof site.id === 'string' && (site.team_id === null || typeof site.team_id === 'string'))

const isLocationsResponse = (value: unknown): value is { success: boolean; locations: OrgLocationSummary[] } =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && Array.isArray(value.locations)
  && value.locations.every(location => isRecord(location) && typeof location.id === 'string' && typeof location.title === 'string' && (location.team_id === null || typeof location.team_id === 'string'))

/**
 * The sites and locations an editor can be scoped to. Editor access is always a
 * site team, optionally narrowed to a location team, so inviting an editor and
 * changing a member to editor both pick from these.
 */
export function useOrganizationScopeOptions() {
  const dashboardApi = useDashboardApi()
  const route = useRoute()

  const sites = ref<OrgSiteSummary[]>([])
  const sitesPending = ref(false)
  const sitesError = ref<string | null>(null)
  let sitesRequestId = 0
  const siteOptions = computed(() => sites.value.map(site => ({ label: site.brand_name || site.subdomain || site.id, value: site.id })))

  async function loadSites() {
    if (sites.value.length || sitesPending.value) return
    const requestId = ++sitesRequestId
    sitesPending.value = true
    // A retry that succeeds clears the message the failed one left, the way
    // the location loader below does. Without this the list rendered beside
    // the error that no longer applies.
    sitesError.value = null
    try {
      const response = await dashboardApi('/api/dashboard/context', { validate: isSitesResponse })
      if (requestId !== sitesRequestId) return
      sites.value = response.sites
    } catch (error) {
      if (requestId !== sitesRequestId) return
      sites.value = []
      sitesError.value = error instanceof Error ? error.message : 'Failed to load sites for this organization.'
    } finally {
      if (requestId === sitesRequestId) sitesPending.value = false
    }
  }

  /** The locations of whichever site is selected; empties when the selection changes. */
  function locationsFor(siteId: Ref<string>) {
    const locations = ref<OrgLocationSummary[]>([])
    const pending = ref(false)
    const error = ref<string | null>(null)
    let requestId = 0
    const options = computed(() => locations.value.map(location => ({ label: location.title, value: location.id })))
    const isCurrent = (id: number, site: string) => id === requestId && siteId.value === site

    // Immediate, because both callers pass a ref that starts empty and then
    // gets a site: without it the first value lands before anything is
    // listening and the locations stay empty with no request ever made.
    watch(siteId, async (site) => {
      const id = ++requestId
      locations.value = []
      if (!site) {
        pending.value = false
        return
      }
      pending.value = true
      error.value = null
      try {
        const response = await dashboardApi(`/api/sites/${site}/locations`, { validate: isLocationsResponse })
        if (!isCurrent(id, site)) return
        locations.value = response.locations
      } catch (caught) {
        if (!isCurrent(id, site)) return
        locations.value = []
        error.value = caught instanceof Error ? caught.message : 'Failed to load locations for this site.'
      } finally {
        if (isCurrent(id, site)) pending.value = false
      }
    }, { immediate: true })

    return { locations, options, pending, error }
  }

  watch(() => route.params.orgSlug, () => {
    sitesRequestId += 1
    sites.value = []
    sitesPending.value = false
    sitesError.value = null
  })

  return { sites, siteOptions, sitesPending, sitesError, loadSites, locationsFor }
}
