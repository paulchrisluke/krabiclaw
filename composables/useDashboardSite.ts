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
  enabled_features: string | null
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
  city: string | null
  address: { addressLines?: string[] } | null
  hero_url: string | null
  enabled_features: string | null
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

// dashboard-site-header.client.ts attaches x-dashboard-org-slug/site-slug on every
// dashboard-scoped /api/* call, but only client-side. On SSR (a direct full-page
// load of a nested /dashboard/{orgSlug}/sites/{siteSlug}/... route) that plugin
// never runs, so any page/composable doing its own SSR fetch to a dashboard/billing/
// integration endpoint must build these headers itself — this is the one correct
// implementation; nothing else should hand-roll a cookie-only header set.
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
  // Only initialize state on client to avoid hydration mismatches
  const state = useState<DashboardContextResponse | null>('dashboard:site-context', () => null)
  const pending = useState<boolean>('dashboard:site-context:pending', () => false)
  const refreshGeneration = useState<number>('dashboard:site-context:generation', () => 0)

  async function refresh() {
    const headers = buildDashboardRequestHeaders()
    const generation = ++refreshGeneration.value

    pending.value = true
    try {
      const response = await $fetch<DashboardContextResponse>('/api/dashboard/context', { headers })
      if (generation === refreshGeneration.value) state.value = response
      return response
    } finally {
      if (generation === refreshGeneration.value) pending.value = false
    }
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
  if (!dashboard.state.value) await dashboard.refresh()
  const siteId = dashboard.siteId.value
  if (!siteId) {
    throw createError({ statusCode: 404, message: 'Site not found' })
  }
  return siteId
}
