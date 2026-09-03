// Unread badge for the menu's notification bell. Reads the same endpoint the
// notifications page uses, kept separate from that page's list so the bell does
// not have to load fifty rows to render a number.
export function useNotificationUnreadCount() {
  const dashboardApi = useDashboardApi()
  const unreadCount = useState('dashboard-notifications-unread', () => 0)

  const isUnreadCountResponse = (value: unknown): value is { unread_count: number } =>
    isRecord(value) && typeof value.unread_count === 'number'

  async function refreshUnreadCount() {
    try {
      const response = await dashboardApi('/api/dashboard/notifications/unread-count', {
        validate: isUnreadCountResponse,
      })
      unreadCount.value = response.unread_count
    } catch {
      // A failed count is not worth surfacing: the bell simply shows no badge.
      unreadCount.value = 0
    }
  }

  return { unreadCount, refreshUnreadCount }
}
