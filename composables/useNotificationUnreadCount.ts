export function useNotificationUnreadCount() {
  const route = useRoute()
  const dashboardApi = useDashboardApi()
  const realtime = useDashboardInvalidations()
  const unreadCount = ref(0)
  const error = shallowRef<unknown>(null)
  let latestRequestId = 0

  const orgSlug = computed(() => typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null)

  const isUnreadCountResponse = (value: unknown): value is { unread_count: number } =>
    isRecord(value) && typeof value.unread_count === 'number'

  async function refresh() {
    const requestId = ++latestRequestId
    if (!orgSlug.value) {
      unreadCount.value = 0
      error.value = null
      return
    }
    try {
      const response = await dashboardApi('/api/dashboard/notifications/unread-count', {
        validate: isUnreadCountResponse,
      })
      if (requestId === latestRequestId) {
        unreadCount.value = response.unread_count
        error.value = null
      }
    } catch (cause) {
      if (requestId === latestRequestId) error.value = cause
    }
  }

  watch(orgSlug, () => {
    unreadCount.value = 0
    error.value = null
    void refresh()
  }, { immediate: true })

  watch(realtime.event, (event) => {
    if (event?.type === 'notification.created' || event?.type === 'notification.read') void refresh()
  })
  watch(realtime.connectionEpoch, (epoch) => {
    if (epoch > 0) void refresh()
  })

  const unavailable = computed(() => Boolean(error.value) || realtime.status.value === 'failed')
  return { unreadCount, refresh, error, unavailable }
}
