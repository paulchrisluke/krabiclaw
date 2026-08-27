import type { DashboardRequestScope } from '~/composables/dashboardFetch'

interface DashboardOrganization {
  id: string
  name: string
  slug: string
  logo: string | null
  role: string
  memberId: string
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
}

interface DashboardSiteSummary {
  id: string
  team_id: string | null
  brand_name: string | null
  subdomain: string | null
  vertical: 'restaurant' | 'experience' | 'service' | 'professional_service' | null
  status: string | null
  onboarding_status: string | null
  plan: string | null
  media: Array<{ asset_id: string; slot: string; public_url: string; thumbnail_url: string | null; kind: string | null }>
}

interface DashboardLocation {
  id: string
  slug: string
  title: string
  is_primary: boolean
  status: string
  city: string | null
  address: { addressLines?: string[] } | null
  media: Array<{ asset_id: string; slot: string; public_url: string; thumbnail_url: string | null; kind: string | null }>
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

const isDashboardOrganization = (value: unknown): value is DashboardOrganization =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.name === 'string'
  && typeof value.slug === 'string'
  && (value.logo === null || typeof value.logo === 'string')
  && typeof value.role === 'string'
  && typeof value.memberId === 'string'

const isDashboardSite = (value: unknown): value is DashboardSite =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.organization_id === 'string'
  && (value.brand_name === null || typeof value.brand_name === 'string')
  && (value.subdomain === null || typeof value.subdomain === 'string')
  && (value.public_url === null || typeof value.public_url === 'string')
  && typeof value.status === 'string'
  && typeof value.onboarding_status === 'string'

const isDashboardLocation = (value: unknown): value is DashboardLocation =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.slug === 'string'
  && typeof value.title === 'string'
  && typeof value.is_primary === 'boolean'
  && typeof value.status === 'string'
  && Array.isArray(value.media)
  && value.media.every(item =>
    isRecord(item)
    && typeof item.asset_id === 'string'
    && typeof item.slot === 'string'
    && (item.public_url === null || typeof item.public_url === 'string')
    && (item.thumbnail_url === null || typeof item.thumbnail_url === 'string')
    && (item.kind === null || typeof item.kind === 'string')
  )

const isDashboardContextResponse = (value: unknown): value is DashboardContextResponse =>
  isRecord(value)
  && value.success === true
  && (value.organization === null || isDashboardOrganization(value.organization))
  && (value.site === null || isDashboardSite(value.site))
  && Array.isArray(value.sites)
  && value.sites.every(site =>
    isRecord(site)
    && typeof site.id === 'string'
    && (site.team_id === null || typeof site.team_id === 'string')
    && (site.brand_name === null || typeof site.brand_name === 'string')
    && (site.subdomain === null || typeof site.subdomain === 'string')
    && Array.isArray(site.media)
    && site.media.every(item =>
      isRecord(item)
      && typeof item.asset_id === 'string'
      && typeof item.slot === 'string'
      && (item.public_url === null || typeof item.public_url === 'string')
      && (item.thumbnail_url === null || typeof item.thumbnail_url === 'string')
      && (item.kind === null || typeof item.kind === 'string')
    ))
  && Array.isArray(value.locations)
  && value.locations.every(isDashboardLocation)
  && typeof value.managedServiceEnabled === 'boolean'
  && (
    value.siteAccess === null
    || value.siteAccess === 'organization'
    || value.siteAccess === 'site'
    || value.siteAccess === 'location'
  )

let clientDashboardContextReads: Map<string, Promise<DashboardContextResponse>> | undefined

function getClientDashboardContextReads() {
  if (!import.meta.client) return undefined
  clientDashboardContextReads ??= new Map()
  return clientDashboardContextReads
}

// The dashboard org/site scope is sent as explicit `org`/`site` query params
// (see dashboardFetch in composables/dashboardFetch.ts) rather than headers —
// callers must go through dashboardFetch rather than spreading a bespoke
// transport into individual pages or composables.
// `overrides` lets a caller set additional headers (e.g. a cache-control hint)
// without losing whatever cookie forwarding is already on the returned Headers
// instance (spreading a Headers object with `{ ...headers }` silently drops
// its entries).
export function buildDashboardRequestHeaders(
  overrides?: Record<string, string>,
): Headers {
  const headers = new Headers(import.meta.server ? useRequestHeaders(['cookie']) : undefined)
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) headers.set(key, value)
  }
  return headers
}

export function buildDashboardRequestQuery(scope: DashboardRequestScope): Record<string, string> {
  const query: Record<string, string> = { org: scope.orgSlug }
  if (scope.siteSlug) query.site = scope.siteSlug
  return query
}

export function useDashboardSite() {
  const scope = useDashboardRouteScope()
  const contextByScope = useState<Record<string, DashboardContextResponse | null>>('dashboard:contexts', () => ({}))
  const pendingByScope = useState<Record<string, boolean>>('dashboard:context-pending', () => ({}))
  const contextKey = computed(() => {
    const current = scope.value
    return current ? `${current.orgSlug}:${current.siteSlug ?? ''}` : ''
  })
  const state = computed<DashboardContextResponse | null>({
    get: () => contextKey.value ? contextByScope.value[contextKey.value] ?? null : null,
    set: (value) => {
      if (!contextKey.value) return
      contextByScope.value = { ...contextByScope.value, [contextKey.value]: value }
    },
  })
  const pending = computed(() => contextKey.value ? pendingByScope.value[contextKey.value] ?? false : false)

  async function refresh(signal?: AbortSignal) {
    const requestScope = scope.value
    const requestKey = contextKey.value
    if (!requestScope || !requestKey) {
      state.value = null
      return null
    }
    const sharedReads = !signal ? getClientDashboardContextReads() : undefined
    const existing = sharedReads?.get(requestKey)
    if (existing) return await existing
    pendingByScope.value = { ...pendingByScope.value, [requestKey]: true }
    const pendingRead = (import.meta.server
      ? (async () => {
          const event = useRequestEvent()
          if (!event) throw createError({ statusCode: 500, statusMessage: 'Dashboard request context unavailable' })
          const [{ loadDashboardContext }, { finalizeRequestMetrics }] = await Promise.all([
            import('~/server/utils/dashboard-context-service'),
            import('~/server/utils/request-metrics'),
          ])
          const response = await loadDashboardContext(event, requestScope) as DashboardContextResponse
          return finalizeRequestMetrics(event, 'dashboard-context-ssr', response) as DashboardContextResponse
        })()
      : dashboardFetch<DashboardContextResponse>('/api/dashboard/context', requestScope, {
          signal,
          validate: isDashboardContextResponse,
        }))
      .then((response) => {
        if (!isDashboardContextResponse(response)) {
          throw new ApiClientError('Dashboard context response did not match its contract', 502, 'INVALID_API_RESPONSE', null)
        }
        contextByScope.value = { ...contextByScope.value, [requestKey]: response }
        return response
      })
      .finally(() => {
        pendingByScope.value = { ...pendingByScope.value, [requestKey]: false }
        if (sharedReads?.get(requestKey) === pendingRead) {
          sharedReads.delete(requestKey)
        }
      })
    sharedReads?.set(requestKey, pendingRead)
    return await pendingRead
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
    scope,
    contextKey,
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
  if (!dashboard.state.value) throw createError({ statusCode: 503, message: 'Dashboard context not loaded' })
  const siteId = dashboard.siteId.value
  if (!siteId) {
    throw createError({ statusCode: 404, message: 'Site not found' })
  }
  return siteId
}
