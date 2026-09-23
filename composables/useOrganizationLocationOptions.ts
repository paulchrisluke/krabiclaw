export interface OrgLocationSummary { id: string; team_id: string | null; title: string }

const isLocationsResponse = (value: unknown): value is { success: boolean; locations: OrgLocationSummary[] } =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && Array.isArray(value.locations)
  && value.locations.every(location => isRecord(location) && typeof location.id === 'string' && typeof location.title === 'string' && (location.team_id === null || typeof location.team_id === 'string'))

/**
 * The locations an editor can be scoped to. Editor access is a location team,
 * so inviting an editor and changing a member to editor both pick from these.
 */
export function useOrganizationLocationOptions() {
  const dashboardApi = useDashboardApi()
  const route = useRoute()

  const locations = ref<OrgLocationSummary[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)
  let requestId = 0
  const options = computed(() => locations.value.map(location => ({ label: location.title, value: location.id })))

  async function load() {
    if (locations.value.length || pending.value) return
    const id = ++requestId
    pending.value = true
    // A retry that succeeds clears the message the failed one left, so the
    // list never renders beside an error that no longer applies.
    error.value = null
    try {
      const response = await dashboardApi('/api/dashboard/locations', { validate: isLocationsResponse })
      if (id !== requestId) return
      locations.value = response.locations
    } catch (caught) {
      if (id !== requestId) return
      locations.value = []
      error.value = caught instanceof Error ? caught.message : 'Failed to load locations for this organization.'
    } finally {
      if (id === requestId) pending.value = false
    }
  }

  watch(() => route.params.orgSlug, () => {
    requestId += 1
    locations.value = []
    pending.value = false
    error.value = null
  })

  return { locations, options, pending, error, load }
}
