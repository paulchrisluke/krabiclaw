<template>
  <UDashboardPanel id="organization-notifications">
    <template #header>
      <UDashboardNavbar title="Notifications">
        <template #leading>
          <DashboardNavbarLeading :to="organizationPath" label="Organization" />
        </template>
        <template #right>
          <UButton
            v-if="unreadCount > 0"
            label="Mark all read"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="markingAll"
            @click="markAllRead"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="w-full max-w-[var(--ws-page-narrow,45rem)]">
        <div v-if="loading && notifications.length === 0" class="space-y-3">
          <USkeleton v-for="index in 4" :key="index" class="h-16 rounded-lg" />
        </div>

        <div v-else-if="notifications.length === 0" class="py-16 text-center">
          <UIcon name="i-lucide-bell-off" class="mx-auto mb-3 size-7 text-muted" />
          <p class="text-sm text-muted">No notifications yet.</p>
        </div>

        <div v-else class="divide-y divide-default border-y border-default">
          <button
            v-for="notification in notifications"
            :key="notification.id"
            type="button"
            class="flex w-full items-start gap-3.5 py-4 text-left transition-colors hover:bg-elevated"
            @click="openNotification(notification)"
          >
            <span class="mt-1.5 flex size-2 shrink-0">
              <span class="size-2 rounded-full" :class="notification.read_at ? 'bg-muted' : severityDot(notification.severity)" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-medium text-highlighted">{{ notification.title || 'Notification' }}</span>
              <span v-if="notification.message" class="mt-0.5 block text-sm text-muted">{{ notification.message }}</span>
              <span class="mt-1 block text-xs text-dimmed">{{ formatExactDateTime(notification.created_at, { includeTime: true }) }}</span>
            </span>
            <UIcon v-if="notification.deep_link" name="i-lucide-chevron-right" class="mt-1 size-4 shrink-0 text-dimmed" />
          </button>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { organizationPath } = useDashboardPaths()
useSeoMeta({ title: 'Notifications | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const dashboardApi = useDashboardApi()
const { formatExactDateTime } = useHumanTime()

interface DashboardNotification {
  id: string
  scope: 'platform' | 'organization' | 'site'
  event_type: string
  severity: 'info' | 'success' | 'warning' | 'error'
  title: string | null
  message: string | null
  deep_link: string | null
  created_at: string
  read_at: string | null
}

interface NotificationResponse {
  notifications: DashboardNotification[]
  unread_count: number
}

const isNotificationResponse = (value: unknown): value is NotificationResponse =>
  isRecord(value)
  && Array.isArray(value.notifications)
  && value.notifications.every(notification =>
    isRecord(notification)
    && typeof notification.id === 'string'
    && typeof notification.severity === 'string',
  )
  && typeof value.unread_count === 'number'

const notifications = ref<DashboardNotification[]>([])
const unreadCount = ref(0)
const loading = ref(false)
const markingAll = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | undefined

function severityDot(severity: DashboardNotification['severity']) {
  if (severity === 'error') return 'bg-error'
  if (severity === 'warning') return 'bg-warning'
  if (severity === 'success') return 'bg-success'
  return 'bg-primary'
}

// A deep link is stored data, so it is treated as untrusted: only a same-origin
// destination is followed, and only its path is handed to the router.
function safeDeepLink(value: string | null): string | null {
  if (!value || !import.meta.client) return null
  try {
    const resolved = new URL(value, window.location.origin)
    if (resolved.origin !== window.location.origin) return null
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return null
  }
}

async function refreshNotifications() {
  if (loading.value) return
  loading.value = true
  try {
    const response = await dashboardApi<NotificationResponse>('/api/dashboard/notifications', {
      query: { limit: 50 },
      validate: isNotificationResponse,
    })
    notifications.value = response.notifications
    unreadCount.value = response.unread_count
  } catch (error) {
    console.error('notifications_load_failed', error)
  } finally {
    loading.value = false
  }
}

async function markRead(notification: DashboardNotification) {
  if (notification.read_at) return
  await dashboardApi(`/api/dashboard/notifications/${notification.id}/read`, {
    method: 'PATCH',
    validate: (value): value is { success: true } => isRecord(value) && value.success === true,
  })
  notification.read_at = new Date().toISOString()
  unreadCount.value = Math.max(0, unreadCount.value - 1)
}

async function markAllRead() {
  markingAll.value = true
  try {
    await dashboardApi('/api/dashboard/notifications/read-all', {
      method: 'PATCH',
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    const now = new Date().toISOString()
    notifications.value = notifications.value.map(notification => ({ ...notification, read_at: notification.read_at ?? now }))
    unreadCount.value = 0
  } finally {
    markingAll.value = false
  }
}

async function openNotification(notification: DashboardNotification) {
  try {
    await markRead(notification)
  } catch (error) {
    console.error('notification_mark_read_failed', error)
  }
  const destination = safeDeepLink(notification.deep_link)
  if (destination) await navigateTo(destination)
}

onMounted(() => {
  refreshNotifications().catch(console.error)
  refreshTimer = setInterval(() => refreshNotifications().catch(console.error), 60_000)
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>
