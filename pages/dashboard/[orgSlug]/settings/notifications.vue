<template>
  <DashboardIndexPanel id="organization-notifications" title="Notifications">
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

    <div class="mx-auto w-full max-w-[var(--ws-page-narrow,45rem)]">
      <UAlert
        v-if="loadError || realtimeFailed"
        color="warning"
        variant="soft"
        icon="i-lucide-wifi-off"
        title="Notifications may be out of date"
        :description="loadError ? 'Notifications could not be loaded.' : 'The live dashboard connection is unavailable.'"
        class="mb-4"
      >
        <template #actions>
          <UButton color="warning" variant="soft" size="xs" :loading="loading" @click="retryNotifications">
            Refresh
          </UButton>
        </template>
      </UAlert>
      <div v-if="loading && notifications.length === 0" class="space-y-3">
        <USkeleton v-for="index in 4" :key="index" class="h-16 rounded-lg" />
      </div>

      <div v-else-if="!loadError && !realtimeFailed && notifications.length === 0" class="py-16 text-center">
        <UIcon name="i-lucide-bell-off" class="mx-auto mb-3 size-7 text-muted" />
        <p class="text-sm text-muted">No notifications yet.</p>
      </div>

      <!--
        A row is what the reference draws: a mark for what happened, the
        title, one line under it, when. Unread is bold. Nothing else, and no
        chevron; the row itself opens the thing.
      -->
      <div v-else class="divide-y divide-default">
        <button
          v-for="notification in notifications"
          :key="notification.id"
          type="button"
          class="flex w-full items-start gap-4 py-5 text-left transition-colors hover:bg-elevated/60"
          @click="openNotification(notification)"
        >
          <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-elevated">
            <UIcon :name="iconFor(notification.template)" class="size-5" :class="notification.read_at ? 'text-muted' : 'text-highlighted'" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-highlighted" :class="notification.read_at ? 'font-medium' : 'font-semibold'">{{ notification.title || 'Notification' }}</span>
            <span v-if="notification.message" class="mt-0.5 line-clamp-2 block text-sm text-muted">{{ notification.message }}</span>
            <span class="mt-1 block text-sm text-dimmed">{{ formatRelativeTime(notification.created_at) }}</span>
          </span>
          <span v-if="!notification.read_at" class="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
        </button>
      </div>
    </div>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

useSeoMeta({ title: 'Notifications | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const dashboardApi = useDashboardApi()
const realtime = useDashboardInvalidations()
const { formatRelativeTime } = useHumanTime()

interface DashboardNotification {
  id: string
  scope: 'global' | 'organization'
  template: string
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
const loadError = shallowRef<unknown>(null)
const realtimeFailed = computed(() => realtime.status.value === 'failed')
let latestRequestId = 0

/** The mark for what happened: a message, a booking, a review, a person. */
function iconFor(template: string) {
  if (/review/.test(template)) return 'i-lucide-star'
  if (/reservation|booking/.test(template)) return 'i-lucide-calendar-check'
  if (/reply|contact|msg|message/.test(template)) return 'i-lucide-message-square'
  if (/signup|invite|member/.test(template)) return 'i-lucide-user-round'
  return 'i-lucide-bell'
}

// A deep link is a dashboard path the server wrote, sometimes under another
// host (production, or a snapshot restored locally). Only its path is handed
// to the router.
function safeDeepLink(value: string | null): string | null {
  if (!value || !import.meta.client) return null
  try {
    const resolved = new URL(value, window.location.origin)
    if (!resolved.pathname.startsWith('/dashboard')) return null
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return null
  }
}

async function refreshNotifications() {
  const requestId = ++latestRequestId
  loading.value = true
  try {
    const response = await dashboardApi<NotificationResponse>('/api/dashboard/notifications', {
      query: { limit: 50 },
      validate: isNotificationResponse,
    })
    if (requestId !== latestRequestId) return
    notifications.value = response.notifications
    unreadCount.value = response.unread_count
    loadError.value = null
  } catch (error) {
    if (requestId === latestRequestId) loadError.value = error
  } finally {
    if (requestId === latestRequestId) loading.value = false
  }
}

function retryNotifications() {
  realtime.connect()
  void refreshNotifications()
}

async function markRead(notification: DashboardNotification) {
  if (notification.read_at) return
  await dashboardApi(`/api/dashboard/notifications/${notification.id}/read`, {
    method: 'PATCH',
    validate: (value): value is { success: true } => isRecord(value) && value.success === true,
  })
  await refreshNotifications()
}

async function markAllRead() {
  markingAll.value = true
  try {
    await dashboardApi('/api/dashboard/notifications/read-all', {
      method: 'PATCH',
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    // The server's list is the state; a refresh also outranks any older read
    // still in flight, which a local rewrite of the rows would not.
    await refreshNotifications()
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

watch(realtime.event, (event) => {
  if (event?.type === 'notification.created' || event?.type === 'notification.read') void refreshNotifications()
})

watch(realtime.connectionEpoch, (epoch) => {
  if (epoch > 0) void refreshNotifications()
})

onMounted(() => void refreshNotifications())
</script>
