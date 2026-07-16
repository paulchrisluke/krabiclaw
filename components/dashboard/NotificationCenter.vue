<template>
  <UPopover :content="{ align: 'end', sideOffset: 8 }">
    <UButton
      icon="i-lucide-bell"
      color="neutral"
      variant="ghost"
      size="sm"
      aria-label="Open notifications"
      class="relative"
      @click="refreshNotifications"
    >
      <span
        v-if="unreadCount > 0"
        class="absolute -right-0.5 -top-0.5 min-w-4 h-4 px-1 rounded-full bg-error text-white text-[10px] leading-4 text-center font-semibold"
      >{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </UButton>

    <template #content>
      <div class="w-[min(24rem,calc(100vw-2rem))]">
        <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-default">
          <div>
            <p class="text-sm font-semibold text-highlighted">Notifications</p>
            <p class="text-xs text-muted">{{ unreadCount }} unread</p>
          </div>
          <UButton
            v-if="unreadCount > 0"
            label="Mark all read"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="markingAll"
            @click="markAllRead"
          />
        </div>

        <div v-if="loading && notifications.length === 0" class="space-y-3 p-4">
          <USkeleton v-for="index in 3" :key="index" class="h-14 rounded-lg" />
        </div>
        <div v-else-if="notifications.length === 0" class="px-4 py-10 text-center">
          <UIcon name="i-lucide-bell-off" class="size-6 text-muted mx-auto mb-2" />
          <p class="text-sm text-muted">No notifications yet.</p>
        </div>
        <div v-else class="max-h-96 overflow-y-auto divide-y divide-default">
          <button
            v-for="notification in notifications"
            :key="notification.id"
            type="button"
            class="w-full flex gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            :class="notification.read_at ? '' : 'bg-primary/5'"
            @click="openNotification(notification)"
          >
            <span class="mt-1 relative flex size-2 shrink-0">
              <span class="size-2 rounded-full" :class="notification.read_at ? 'bg-muted' : severityDot(notification.severity)" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-highlighted truncate">{{ notification.title || 'Notification' }}</span>
              <span v-if="notification.message" class="block text-xs text-muted line-clamp-2 mt-0.5">{{ notification.message }}</span>
              <span class="block text-[11px] text-dimmed mt-1">{{ formatTimestamp(notification.created_at) }}</span>
            </span>
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
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

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

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
    const response = await $fetch<NotificationResponse>('/api/dashboard/notifications', { query: { limit: 20 } })
    notifications.value = response.notifications
    unreadCount.value = response.unread_count
  } catch (error) {
    console.error('notification_center_load_failed', error)
  } finally {
    loading.value = false
  }
}

async function markRead(notification: DashboardNotification) {
  if (notification.read_at) return
  await $fetch(`/api/dashboard/notifications/${notification.id}/read`, { method: 'PATCH' })
  notification.read_at = new Date().toISOString()
  unreadCount.value = Math.max(0, unreadCount.value - 1)
}

async function markAllRead() {
  markingAll.value = true
  try {
    await $fetch('/api/dashboard/notifications/read-all', { method: 'PATCH' })
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
