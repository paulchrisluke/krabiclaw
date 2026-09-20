import type { ComputedRef, Ref } from 'vue'
import type { DashboardRequestScope } from '~/composables/dashboardFetch'

interface DashboardOrganization {
  id: string
  name: string
  slug: string
  logo: string | null
  role: string
  deletionScheduledAt: string | null
}

interface DashboardSite {
  id: string
  organization_id: string
  brand_name: string | null
  theme_id: string
  vertical: 'restaurant' | 'experience' | 'service' | null
  subdomain: string | null
  custom_domain: string | null
  public_url: string | null
  status: string
  onboarding_status: string
  effective_plan: string
  default_currency: string | null
  feature_overrides: string | null
}

interface DashboardSiteSummary {
  id: string
  team_id: string | null
  brand_name: string | null
  subdomain: string | null
  vertical: 'restaurant' | 'experience' | 'service' | null
  status: string | null
  onboarding_status: string | null
  effective_plan: string
  media: Array<{ asset_id: string; slot: string; public_url: string; thumbnail_url: string | null; kind: string | null }>
  social_image: { url: string; width?: number; height?: number; type?: string } | null
}

export interface DashboardLocation {
  id: string
  slug: string
  title: string
  status: string
  city: string | null
  address: PostalAddress | null
  media: Array<{ asset_id: string; slot: string; public_url: string; thumbnail_url: string | null; kind: string | null }>
  social_image: { url: string; width?: number; height?: number; type?: string } | null
  feature_overrides: string | null
  parent_site_id?: string
  parent_site_name?: string
  parent_site_slug?: string
}

interface DashboardContextResponse {
  success: boolean
  organization: DashboardOrganization | null
  site: DashboardSite | null
  sites: DashboardSiteSummary[]
  locations: DashboardLocation[]
  siteAccess: 'organization' | 'site' | 'location' | null
}

const isDashboardOrganization = (value: unknown): value is DashboardOrganization =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.name === 'string'
  && typeof value.slug === 'string'
  && (value.logo === null || typeof value.logo === 'string')
  && typeof value.role === 'string'
  && (value.deletionScheduledAt === null || typeof value.deletionScheduledAt === 'string')

const isSocialImage = (value: unknown): value is { url: string } | null =>
  value === null || (isRecord(value) && typeof value.url === 'string')

const isDashboardSite = (value: unknown): value is DashboardSite =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.organization_id === 'string'
  && (value.brand_name === null || typeof value.brand_name === 'string')
  && (value.subdomain === null || typeof value.subdomain === 'string')
  && (value.public_url === null || typeof value.public_url === 'string')
  && typeof value.status === 'string'
  && typeof value.onboarding_status === 'string'
  && (value.default_currency === null || typeof value.default_currency === 'string')
  && isSocialImage(value.social_image)

const isDashboardLocation = (value: unknown): value is DashboardLocation =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.slug === 'string'
  && typeof value.title === 'string'
  && typeof value.status === 'string'
  && isSocialImage(value.social_image)
  && Array.isArray(value.media)
  && value.media.every(item =>
    isRecord(item)
    && typeof item.asset_id === 'string'
    && typeof item.slot === 'string'
    && (item.public_url === null || typeof item.public_url === 'string')
    && (item.thumbnail_url === null || typeof item.thumbnail_url === 'string')
    && (item.kind === null || typeof item.kind === 'string')
  )
  && (value.parent_site_id === undefined || typeof value.parent_site_id === 'string')
  && (value.parent_site_name === undefined || typeof value.parent_site_name === 'string')
  && (value.parent_site_slug === undefined || typeof value.parent_site_slug === 'string')

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
    && isSocialImage(site.social_image)
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
  && (
    value.siteAccess === null
    || value.siteAccess === 'organization'
    || value.siteAccess === 'site'
    || value.siteAccess === 'location'
  )

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

/** The scope key the context is stored under. Empty on an unscoped route. */
function dashboardContextKey(scope: Ref<DashboardRequestScope | null> | ComputedRef<DashboardRequestScope | null>) {
  return computed(() => {
    const current = scope.value
    return current ? `dashboard:context:${current.orgSlug}:${current.siteSlug ?? ''}` : 'dashboard:context:unscoped'
  })
}

/**
 * Registers the context request. layouts/dashboard.vue is the only caller.
 * Nothing else starts a context request; every other consumer reads the
 * result through `useDashboardSite()`.
 *
 * The scope comes from the router's live route, not `useRoute()`. In a layout,
 * `useRoute()` is Nuxt's lagging copy that only advances once the destination
 * page has rendered -- and the layout does not render that page until this
 * request has answered for the destination, so the two would wait on each
 * other. The result carries the key it answered for: on a scope change Nuxt
 * seeds the new key's `data` with the previous scope's result until the new
 * one lands, so `data` alone cannot say which scope it belongs to.
 */
export function useDashboardContextOwner() {
  const scope = useDashboardRouteScope(useRouter().currentRoute)
  const contextKey = dashboardContextKey(scope)

  const request = useAsyncData<{ key: string; context: DashboardContextResponse | null }>(
    () => contextKey.value,
    async (_nuxtApp, { signal }) => {
      const key = contextKey.value
      const current = scope.value

      // An unscoped route has no context to ask for. Checked on every
      // execution, so navigation and manual refresh are covered too.
      if (!current) return { key, context: null }

      const response = await $fetch<unknown>('/api/dashboard/context', {
        query: buildDashboardRequestQuery(current),
        signal,
      })

      if (!isDashboardContextResponse(response)) {
        throw new ApiClientError(
          'Dashboard context response did not match its contract',
          502,
          'INVALID_API_RESPONSE',
          null,
        )
      }

      return { key, context: response }
    },
  )

  return Object.assign(request, { contextKey })
}

/**
 * Reads the context the owner already fetched. Starts no request, registers no
 * async data and holds no state of its own, so mounting a hundred consumers
 * costs nothing.
 */
export function useDashboardSite() {
  const nuxtApp = useNuxtApp()
  const scope = useDashboardRouteScope()
  const contextKey = dashboardContextKey(scope)

  const state = computed<DashboardContextResponse | null>(() => {
    const entry = nuxtApp.payload.data[contextKey.value] as { key: string; context: DashboardContextResponse | null } | undefined
    return entry?.context ?? null
  })

  const organization = computed(() => state.value?.organization ?? null)
  const site = computed(() => state.value?.site ?? null)
  const siteId = computed(() => site.value?.id ?? null)
  const sites = computed(() => state.value?.sites ?? [])
  const locations = computed(() => state.value?.locations ?? [])
  const siteAccess = computed(() => state.value?.siteAccess ?? null)

  return {
    state,
    scope,
    contextKey,
    organization,
    site,
    siteId,
    sites,
    locations,
    siteAccess,
    /** Re-runs the owner's request. For an explicit reload after a mutation. */
    refresh: () => refreshNuxtData(contextKey.value),
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
