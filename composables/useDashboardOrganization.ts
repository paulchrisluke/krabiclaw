import type { ComputedRef, Ref } from 'vue'
import type { DashboardRequestScope } from '~/composables/dashboardFetch'

/**
 * The tenant, as the dashboard reads it.
 *
 * Identity, role and configuration arrive on one object because they are one
 * row. There used to be a `site` beside this carrying the configuration, and a
 * `sites` list to switch between: a business is its organization, so the
 * switcher and the second scope are gone.
 */
export interface DashboardOrganization {
  id: string
  name: string
  slug: string
  role: string
  deletionScheduledAt: string | null
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
}

export type DashboardAccess = 'organization' | 'location'

interface DashboardContextResponse {
  success: boolean
  organization: DashboardOrganization
  locations: DashboardLocation[]
  access: DashboardAccess
}

const isSocialImage = (value: unknown): value is { url: string } | null =>
  value === null || (isRecord(value) && typeof value.url === 'string')

const isMediaList = (value: unknown): boolean =>
  Array.isArray(value)
  && value.every(item =>
    isRecord(item)
    && typeof item.asset_id === 'string'
    && typeof item.slot === 'string'
    && (item.public_url === null || typeof item.public_url === 'string')
    && (item.thumbnail_url === null || typeof item.thumbnail_url === 'string')
    && (item.kind === null || typeof item.kind === 'string')
  )

const isDashboardOrganization = (value: unknown): value is DashboardOrganization =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.name === 'string'
  && typeof value.slug === 'string'
  && typeof value.role === 'string'
  && (value.deletionScheduledAt === null || typeof value.deletionScheduledAt === 'string')
  && typeof value.theme_id === 'string'
  && (value.subdomain === null || typeof value.subdomain === 'string')
  && (value.public_url === null || typeof value.public_url === 'string')
  && typeof value.status === 'string'
  && typeof value.onboarding_status === 'string'
  && (value.default_currency === null || typeof value.default_currency === 'string')
  && isMediaList(value.media)
  && isSocialImage(value.social_image)

const isDashboardLocation = (value: unknown): value is DashboardLocation =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.slug === 'string'
  && typeof value.title === 'string'
  && typeof value.status === 'string'
  && isSocialImage(value.social_image)
  && isMediaList(value.media)

const isDashboardContextResponse = (value: unknown): value is DashboardContextResponse =>
  isRecord(value)
  && value.success === true
  && isDashboardOrganization(value.organization)
  && Array.isArray(value.locations)
  && value.locations.every(isDashboardLocation)
  && (value.access === 'organization' || value.access === 'location')

// The dashboard org scope is sent as an explicit `org` query param (see
// dashboardFetch in composables/dashboardFetch.ts) rather than a header —
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
  return { org: scope.orgSlug }
}

/** The scope key the context is stored under. Empty on an unscoped route. */
function dashboardContextKey(scope: Ref<DashboardRequestScope | null> | ComputedRef<DashboardRequestScope | null>) {
  return computed(() => {
    const current = scope.value
    return current ? `dashboard:context:${current.orgSlug}` : 'dashboard:context:unscoped'
  })
}

/**
 * Registers the context request. layouts/dashboard.vue is the only caller.
 * Nothing else starts a context request; every other consumer reads the
 * result through `useDashboardOrganization()`.
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
export function useDashboardOrganization() {
  const nuxtApp = useNuxtApp()
  const scope = useDashboardRouteScope()
  const contextKey = dashboardContextKey(scope)

  const state = computed<DashboardContextResponse | null>(() => {
    const entry = nuxtApp.payload.data[contextKey.value] as { key: string; context: DashboardContextResponse | null } | undefined
    return entry?.context ?? null
  })

  const organization = computed(() => state.value?.organization ?? null)
  const organizationId = computed(() => organization.value?.id ?? null)
  const locations = computed(() => state.value?.locations ?? [])
  const access = computed(() => state.value?.access ?? null)

  return {
    state,
    scope,
    contextKey,
    organization,
    organizationId,
    locations,
    access,
    /** Re-runs the owner's request. For an explicit reload after a mutation. */
    refresh: () => refreshNuxtData(contextKey.value),
  }
}

/** The tenant id, or a thrown error when the context has not loaded. */
export async function useDashboardOrganizationId() {
  const dashboard = useDashboardOrganization()
  if (!dashboard.state.value) throw createError({ statusCode: 503, message: 'Dashboard context not loaded' })
  const organizationId = dashboard.organizationId.value
  if (!organizationId) throw createError({ statusCode: 404, message: 'Organization not found' })
  return organizationId
}
