interface DashboardOrganization {
  id: string
  name: string
  slug: string
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
  feature_overrides: string | null
  heroImageUrl?: string | null
  locationHeroImageUrl?: string | null
}

interface DashboardSiteSummary {
  id: string
  brand_name: string | null
  subdomain: string | null
  vertical: 'restaurant' | 'experience' | 'service' | 'professional_service' | null
  status: string | null
  onboarding_status: string | null
  plan: string | null
}

interface DashboardLocation {
  id: string
  slug: string
  title: string
  is_primary: boolean
  status: string
  city: string | null
  address: { addressLines?: string[] } | null
  hero_url: string | null
  feature_overrides: string | null
}

interface DashboardContextResponse {
  success: boolean
  organization: DashboardOrganization | null
  site: DashboardSite | null
  sites: DashboardSiteSummary[]
  locations: DashboardLocation[]
  managedServiceEnabled: boolean
  siteAccess: 'organization' | 'site' | 'location' | null
}

// Central legacy dashboard scope adapter. Better Auth migration issue #386 owns
// removing these route headers; callers must go through dashboardFetch rather
// than spreading this debt into individual pages or composables.
// `overrides` lets a caller (e.g. a per-request site-slug filter) set additional
// headers without losing the org/site ones already on the returned Headers instance
// (spreading a Headers object with `{ ...headers }` silently drops its entries).
export function buildDashboardRequestHeaders(overrides?: Record<string, string>): Headers {
  const route = useRoute()
  const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
  const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
  const headers = new Headers(import.meta.server ? useRequestHeaders(['cookie']) : undefined)
  if (orgSlug) headers.set('x-dashboard-org-slug', orgSlug)
  if (siteSlug) headers.set('x-dashboard-site-slug', siteSlug)
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) headers.set(key, value)
  }
  return headers
}

export function useDashboardSite() {
  const route = useRoute()
  const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : 'none'
  const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : 'none'
  const contextKey = `dashboard:site-context:${orgSlug}:${siteSlug}`
  const state = useState<DashboardContextResponse | null>(contextKey, () => null)
  const pending = useState<boolean>(`${contextKey}:pending`, () => false)
  let inFlight: Promise<DashboardContextResponse> | null = null

  async function refresh() {
    if (inFlight) return await inFlight
    pending.value = true
    inFlight = dashboardFetch<DashboardContextResponse>('/api/dashboard/context')
      .then((response) => {
        if (!response?.success || !Array.isArray(response.sites) || !Array.isArray(response.locations)) {
          throw new ApiClientError('Dashboard context response did not match its contract', 502, 'INVALID_API_RESPONSE', null)
        }
        state.value = response
        return response
      })
      .finally(() => {
        pending.value = false
        inFlight = null
      })
    return await inFlight
  }

  const organization = computed(() => state.value?.organization ?? null)
  const site = computed(() => state.value?.site ?? null)
  const siteId = computed(() => site.value?.id ?? null)
  const sites = computed(() => state.value?.sites ?? [])
  const locations = computed(() => state.value?.locations ?? [])
  const managedServiceEnabled = computed(() => state.value?.managedServiceEnabled ?? false)
  const siteAccess = computed(() => state.value?.siteAccess ?? null)

  return {
    state,
    pending,
    organization,
    site,
    siteId,
    sites,
    locations,
    managedServiceEnabled,
    siteAccess,
    refresh
  }
}

export async function useDashboardSiteId() {
  const dashboard = useDashboardSite()
  if (!dashboard.state.value) {
    await dashboard.refresh()
  }
  const siteId = dashboard.siteId.value
  if (!siteId) {
    throw createError({ statusCode: 404, message: 'Site not found' })
  }
  return siteId
}
