import type { FetchOptions } from 'ofetch'

type DashboardFetchOptions<T> = FetchOptions & {
  validate?: Validator<T>
  coalesceKey?: string
}

export interface DashboardRequestScope {
  orgSlug: string
  siteSlug?: string | null
}

const dashboardInFlightReads = new Map<string, Promise<unknown>>()

const stableValue = (value: unknown): string => {
  if (value === undefined) return ''
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
    .join(',')}}`
}

async function executeApiFetch<T>(
  request: string,
  options: DashboardFetchOptions<T>,
  headers: Headers,
): Promise<T> {
  const method = String(options.method ?? 'GET').toUpperCase()
  const { validate, coalesceKey, ...fetchOptions } = options
  const run = async () => {
    try {
      const value = await $fetch<unknown>(request as never, {
        ...fetchOptions,
        headers,
        retry: 0,
        timeout: method === 'GET' ? DASHBOARD_READ_TIMEOUT_MS : MUTATION_TIMEOUT_MS,
      } as never)
      const responseIsValid = validate
        ? validate(value)
        : method === 'GET'
          ? isRecord(value) || Array.isArray(value)
          : value === null || value === '' || isRecord(value) || Array.isArray(value)
      if (!responseIsValid) {
        throw new ApiClientError('API response did not match its contract', 502, 'INVALID_API_RESPONSE', null)
      }
      return value as T
    } catch (error) {
      throw normalizeApiError(error, 'Dashboard API request failed')
    }
  }

  if (method !== 'GET' || fetchOptions.signal) return await run()
  // Coalescing is browser-only to prevent SSR cross-request data leakage.
  // In server context, every request must stand alone without shared state.
  if (import.meta.server) return await run()
  const key = coalesceKey ?? `${request}:${stableValue(fetchOptions.query)}:${stableValue([...headers])}`
  const existing = dashboardInFlightReads.get(key) as Promise<T> | undefined
  if (existing) return await existing
  const pending = run().finally(() => {
    if (dashboardInFlightReads.get(key) === pending) dashboardInFlightReads.delete(key)
  })
  dashboardInFlightReads.set(key, pending)
  return await pending
}

/**
 * The only browser transport for route-scoped dashboard data. Scope is read
 * from the route at the call site and is always sent explicitly to the API.
 */
export async function dashboardFetch<T>(
  request: string,
  scope: DashboardRequestScope,
  options: DashboardFetchOptions<T> = {},
): Promise<T> {
  if (!scope.orgSlug) {
    throw createError({ statusCode: 400, statusMessage: 'Dashboard organization scope is required' })
  }
  const headers = buildDashboardRequestHeaders(scope,
    Object.fromEntries(new Headers(options.headers as HeadersInit).entries()),
  )
  return await executeApiFetch(request, options, headers)
}

export function useDashboardRouteScope() {
  const route = useRoute()
  return computed<DashboardRequestScope | null>(() => {
    const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
    if (!orgSlug) return null
    return {
      orgSlug,
      siteSlug: typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null,
    }
  })
}

export function useDashboardApi(scope = useDashboardRouteScope()) {
  return async <T>(request: string, options: DashboardFetchOptions<T> = {}) => {
    const resolved = unref(scope)
    if (!resolved) {
      throw createError({ statusCode: 400, statusMessage: 'Dashboard organization scope is required' })
    }
    return await dashboardFetch<T>(request, resolved, options)
  }
}

export async function applicationFetch<T>(
  request: string,
  options: DashboardFetchOptions<T> = {},
): Promise<T> {
  const headers = new Headers(options.headers as HeadersInit)
  if (import.meta.server) {
    for (const [key, value] of Object.entries(useRequestHeaders(['cookie']))) {
      if (value) headers.set(key, value)
    }
  }
  return await executeApiFetch(request, options, headers)
}
