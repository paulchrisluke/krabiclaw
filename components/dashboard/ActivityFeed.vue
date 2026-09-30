<template>
  <div class="space-y-4">
    <UAlert
      v-if="eventsError"
      color="error"
      variant="soft"
      title="Activity could not be loaded"
      :description="getErrorMessage(eventsError, 'Activity request failed')"
    />
    <div v-if="pending && groups.length === 0" class="space-y-3">
      <USkeleton v-for="i in 5" :key="i" class="h-12 w-full" />
    </div>

    <div v-else-if="!eventsError && groups.length === 0" class="py-16 text-center">
      <UIcon name="i-lucide-activity" class="size-8 text-muted mx-auto mb-3" />
      <p class="text-sm font-medium text-highlighted">No activity yet</p>
      <p class="mt-1 text-xs text-muted">New activity will appear here.</p>
    </div>

    <div v-else class="space-y-6">
      <div v-for="group in groups" :key="group.label">
        <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{{ group.label }}</p>
        <ul class="divide-y divide-default overflow-hidden rounded-2xl border border-default">
          <li v-for="ev in group.events" :key="ev.id" class="flex items-start gap-3 px-4 py-4">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-elevated text-muted">
              <UIcon name="i-lucide-activity" class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-highlighted leading-snug">
                {{ eventLabel(ev.event_type) }}
              </p>
              <p class="mt-1 text-xs text-muted"><span v-if="ev.location_title">{{ ev.location_title }} · </span>{{ timeAgo(ev.created_at) }}</p>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="nextCursor" class="text-center">
        <UButton label="Load more" color="neutral" variant="soft" :loading="loadingMore" @click="loadMore" />
        <UAlert v-if="loadMoreError" color="error" variant="soft" :description="loadMoreError" class="mt-2" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { localDateAt, instantDate, formatCalendarDate, addLocalDays } from '~/utils/timezone'
import { getErrorMessage } from '~/utils/errors'
const dashboardApi = useDashboardApi()
const route = useRoute()

const { eventLabel } = useOrganizationEventLabels()
const { formatRelativeTime: timeAgo } = useHumanTime()
const loadMoreError = ref<string | null>(null)

type OrganizationEvent = import('~/server/utils/dashboard-events').DashboardEvent

const eventsKey = computed(() => `dashboard-events-${String(route.params.orgSlug ?? '')}`)
const isEventsResponse = (value: unknown): value is { events: OrganizationEvent[]; nextCursor: string | null } =>
  isRecord(value)
  && Array.isArray(value.events)
  && value.events.every(event =>
    isRecord(event)
    && typeof event.id === 'string'
    && typeof event.event_type === 'string'
    && (event.organization_id === null || typeof event.organization_id === 'string')
    && typeof event.created_at === 'string',
  )
  && (value.nextCursor === null || typeof value.nextCursor === 'string')

const { data: eventsData, pending, error: eventsError } = await useAsyncData(
  eventsKey,
  () => dashboardApi<{ events: OrganizationEvent[]; nextCursor: string | null }>(
    '/api/dashboard/events',
    { query: { limit: 20 }, validate: isEventsResponse },
  ),
  // Nuxt blocks navigation on useAsyncData by default; the client does not
  // need to wait for this to paint the route, and `pending` already drives a
  // loading state here.
  { lazy: true },
)
const events = ref<OrganizationEvent[]>([])
const nextCursor = ref<string | null>(null)
watch(eventsData, (value) => {
  events.value = value?.events ?? []
  nextCursor.value = value?.nextCursor ?? null
}, { immediate: true })
const loadingMore = ref(false)

async function fetchEvents(before?: string) {
  return await dashboardApi<{ events: OrganizationEvent[]; nextCursor: string | null }>(
    '/api/dashboard/events',
    { query: { limit: 20, before }, validate: isEventsResponse },
  )
}

async function loadMore() {
  if (loadingMore.value) return
  if (!nextCursor.value) return
  // A page from a previous tenant must not append to the current tenant's feed.
  const requestedKey = eventsKey.value
  const cursor = nextCursor.value
  loadingMore.value = true
  loadMoreError.value = null
  try {
    const res = await fetchEvents(cursor)
    if (requestedKey !== eventsKey.value) return
    events.value = [...events.value, ...res.events]
    nextCursor.value = res.nextCursor
  } catch (err) {
    if (requestedKey === eventsKey.value) loadMoreError.value = err instanceof Error ? err.message : 'Failed to load more activity'
  } finally {
    loadingMore.value = false
  }
}

const activityNow = useState('activity-time-reference', () => new Date().toISOString())
function groupLabel(dateStr: string) {
  const todayKey = localDateAt(instantDate(activityNow.value), 'UTC')
  const key = localDateAt(instantDate(dateStr), 'UTC')
  if (key === todayKey) return 'Today'
  if (key === addLocalDays(todayKey, -1)) return 'Yesterday'
  return formatCalendarDate(key, 'en', key.slice(0, 4) === todayKey.slice(0, 4)
    ? { month: 'long', day: 'numeric' } : { month: 'long', year: 'numeric' })
}

const groups = computed(() => {
  const map = new Map<string, OrganizationEvent[]>()
  for (const ev of events.value) {
    const label = groupLabel(ev.created_at)
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(ev)
  }
  return Array.from(map.entries()).map(([label, evs]) => ({ label, events: evs }))
})
</script>
