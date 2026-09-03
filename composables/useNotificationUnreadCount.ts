// Unread badge for the menu's notification bell. Reads the same endpoint the
// notifications page uses, kept separate from that page's list so the bell does
// not have to load fifty rows to render a number.
export function useNotificationUnreadCount() {
  const route = useRoute()
  const dashboardApi = useDashboardApi()
  const unreadCount = useState('dashboard-notifications-unread', () => 0)

  const orgSlug = computed(() => typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null)

  const isUnreadCountResponse = (value: unknown): value is { unread_count: number } =>
    isRecord(value) && typeof value.unread_count === 'number'

  async function refreshUnreadCount() {
    if (!orgSlug.value) {
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
  }

  // The count is scoped to an organization but held in app-wide state, and the
  // bell lives in a slideover the layout mounts once. Without this, switching
  // organizations leaves the previous one's badge on screen until a full reload.
  watch(orgSlug, (next, previous) => {
    if (next === previous) return
    unreadCount.value = 0
    refreshUnreadCount().catch(() => {})
  })

  return { unreadCount, refreshUnreadCount }
}
