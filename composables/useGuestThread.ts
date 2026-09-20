import { isThreadDetailResponse, type ThreadDetail } from '~/lib/components/workspace/messages/guest-thread-client'

/**
 * One guest thread, loaded once per route.
 *
 * The conversation and the record behind it are two levels of the same editor
 * chain and both need this thread: the conversation to draw it, the record
 * level to know which booking it refers to. Both call this, and the shared
 * `useAsyncData` key means that is one request.
 */
export async function useGuestThread(threadId: Ref<string> | ComputedRef<string>) {
  const dashboard = useDashboardSite()
  const dashboardScope = useDashboardRouteScope()
  const dashboardApi = useDashboardApi(dashboardScope)

  const siteId = computed(() => dashboard.siteId.value)
  const key = computed(() => `dashboard-guest-thread:${siteId.value ?? 'pending-site'}:${threadId.value}`)

  const { data, pending, error, refresh } = await useAsyncData<{ thread: ThreadDetail }>(key, async () => {
    if (!dashboardScope.value) {
      throw createError({ statusCode: 400, statusMessage: 'Dashboard route scope is incomplete' })
    }
    if (!siteId.value) {
      throw createError({ statusCode: 400, statusMessage: 'Thread detail requires site scope' })
    }
    return await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${threadId.value}`,
      { validate: isThreadDetailResponse },
    )
  })

  const thread = computed(() => data.value?.thread ?? null)

  return { data, thread, pending, error, refresh, siteId }
}
