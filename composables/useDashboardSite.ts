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
  vertical: 'restaurant' | 'experience' | 'service' | 'professional_service' | null
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
  managedServiceEnabled: boolean
}

export function useDashboardSite() {
  // Only initialize state on client to avoid hydration mismatches
  const state = useState<DashboardContextResponse | null>('dashboard:site-context', () => null)
  const pending = useState<boolean>('dashboard:site-context:pending', () => false)

  async function refresh() {
    // dashboard-site-header.client.ts attaches x-dashboard-site-slug on every /api/dashboard/*
    // call, but only client-side. On SSR (a direct full-page load of a nested
    // /dashboard/{orgSlug}/sites/{siteSlug}/... route) that plugin never runs, so without this
    // the request falls back to context.ts's "auto-select if the org has exactly one site" path
    // and returns site: null for any org with 2+ sites. Read the same siteSlug route segment
    // here so SSR resolves the right site too.
    const route = useRoute()
    const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
    const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
    const headers = new Headers(import.meta.server ? useRequestHeaders(['cookie']) : undefined)
    if (orgSlug) headers.set('x-dashboard-org-slug', orgSlug)
    if (siteSlug) headers.set('x-dashboard-site-slug', siteSlug)

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
  const managedServiceEnabled = computed(() => state.value?.managedServiceEnabled ?? false)

  return {
    state,
    pending,
    organization,
    site,
    siteId,
    sites,
    locations,
    selectedLocation,
    managedServiceEnabled,
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
