// Unread badge for the menu's notification bell. Reads the same endpoint the
// notifications page uses, kept separate from that page's list so the bell does
// not have to load fifty rows to render a number.
//
// The count is a plain ref, not useState. useState exists to carry SSR state to
// the client; this only ever fetches in the browser, so it shared nothing — and
// being app-wide was what let one organization's count survive a switch to
// another. One watch on the organization owns the whole lifecycle: it fetches on
// mount and refetches when the organization changes.
export function useNotificationUnreadCount() {
  const route = useRoute()
  const dashboardApi = useDashboardApi()
  const unreadCount = ref(0)

  const orgSlug = computed(() => typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null)

  const isUnreadCountResponse = (value: unknown): value is { unread_count: number } =>
    isRecord(value) && typeof value.unread_count === 'number'

  watch(orgSlug, async (slug) => {
    if (!slug) {
      unreadCount.value = 0
      return
    }
    try {
      const response = await dashboardApi('/api/dashboard/notifications/unread-count', {
        validate: isUnreadCountResponse,
      })
      unreadCount.value = response.unread_count
    } catch (error) {
      // The badge has no way to render a failure, so it renders nothing — but
      // the error still reaches the console rather than passing for "all read".
      console.error('notification_unread_count_failed', error)
      unreadCount.value = 0
    }
  }, { immediate: true })

  return { unreadCount }
}
