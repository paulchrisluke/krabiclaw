import type { FetchOptions } from 'ofetch'

/**
 * The only browser transport for route-scoped dashboard data. Scope is read
 * from the route at the call site and is always sent explicitly to the API.
 */
export async function dashboardFetch<T>(
  request: string,
  options: FetchOptions = {},
): Promise<T> {
  const route = useRoute()
  const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
  if (!orgSlug) {
    throw createError({ statusCode: 400, statusMessage: 'Dashboard organization scope is required' })
  }
  const headers = buildDashboardRequestHeaders(
    Object.fromEntries(new Headers(options.headers as HeadersInit).entries()),
  )
  const method = String(options.method ?? 'GET').toUpperCase()

  try {
    return await $fetch<T>(request as never, {
      ...options,
      headers,
      retry: 0,
      timeout: method === 'GET' ? DASHBOARD_READ_TIMEOUT_MS : MUTATION_TIMEOUT_MS,
    } as never) as T
  } catch (error) {
    const candidate = error as {
      statusCode?: number
      status?: number
      message?: string
      data?: { error?: { code?: string; message?: string; requestId?: string } }
      response?: { status?: number; headers?: Headers }
    }
    throw new ApiClientError(
      candidate.data?.error?.message ?? candidate.message ?? 'Dashboard API request failed',
      candidate.statusCode ?? candidate.status ?? candidate.response?.status ?? 500,
      candidate.data?.error?.code ?? 'DASHBOARD_API_REQUEST_FAILED',
      candidate.data?.error?.requestId ?? candidate.response?.headers?.get('x-request-id') ?? null,
      error,
    )
  }
}
