interface DashboardOrganization {
  id: string
  name: string
  slug: string | null
  logo: string | null
  role: string
}

interface DashboardSite {
  id: string
  organization_id: string
  brand_name: string | null
  vertical: 'restaurant' | 'experience' | null
  subdomain: string | null
  custom_domain: string | null
  public_url: string | null
  status: string
  onboarding_status: string
  plan: string | null
  primary_location_id: string | null
  default_currency: string | null
  source_locale: string | null
  heroImageUrl?: string | null
  locationHeroImageUrl?: string | null
}

interface DashboardSiteSummary {
  id: string
  brand_name: string | null
  subdomain: string | null
  plan: string | null
}

interface DashboardLocation {
  id: string
  slug: string
  title: string
  is_primary: boolean
  status: string
}

interface DashboardContextResponse {
  success: boolean
  organization: DashboardOrganization
  site: DashboardSite | null
  sites: DashboardSiteSummary[]
  locations: DashboardLocation[]
  selectedLocation: DashboardLocation | null
}

export function useDashboardSite() {
  // Only initialize state on client to avoid hydration mismatches
  const state = useState<DashboardContextResponse | null>('dashboard:site-context', () => null)
  const pending = useState<boolean>('dashboard:site-context:pending', () => false)

  async function refresh() {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

    pending.value = true
    try {
      state.value = await $fetch<DashboardContextResponse>('/api/dashboard/context', { headers })
    } finally {
      pending.value = false
    }
    return state.value
  }

  async function selectLocation(locationId: string) {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

    await $fetch('/api/dashboard/location-preference', {
      method: 'PATCH',
      headers,
      body: { locationId }
    })
    await refresh()
  }

  const organization = computed(() => state.value?.organization ?? null)
  const site = computed(() => state.value?.site ?? null)
  const siteId = computed(() => site.value?.id ?? null)
  const sites = computed(() => state.value?.sites ?? [])
  const locations = computed(() => state.value?.locations ?? [])
  const selectedLocation = computed(() => state.value?.selectedLocation ?? null)

  return {
    state,
    pending,
    organization,
    site,
    siteId,
    sites,
    locations,
    selectedLocation,
    refresh,
    selectLocation
  }
}

export async function useDashboardSiteId() {
  const dashboard = useDashboardSite()
  if (!dashboard.state.value) await dashboard.refresh()
  const siteId = dashboard.siteId.value
  if (!siteId) {
    throw createError({ statusCode: 404, message: 'Site not found' })
  }
  return siteId
}
