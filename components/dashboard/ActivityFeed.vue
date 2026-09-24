<template>
  <div class="space-y-4">
  <div class="grid grid-cols-3 gap-3 mb-4">
    <UFormField label="Location">
      <USelect v-model="filters.locationId" :items="locationOptions" class="w-full" />
    </UFormField>
    <UFormField label="Type">
      <USelect v-model="filters.eventType" :items="eventTypeOptions" class="w-full" />
    </UFormField>
    <UFormField label="Actor">
      <USelect v-model="filters.actorId" :items="actorOptions" class="w-full" />
    </UFormField>
  </div>

    <UAlert
      v-if="locationsError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="locationsError"
      class="mb-4"
    />

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
      <p class="mt-1 text-xs text-muted">Actions across your sites will show up here.</p>
    </div>

    <div v-else class="space-y-6">
      <div v-for="group in groups" :key="group.label">
        <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{{ group.label }}</p>
        <ul class="-mx-4">
          <li v-for="ev in group.events" :key="ev.id" class="flex items-start gap-3 px-4 py-3 border-b border-default last:border-0">
            <div class="min-w-0 flex-1">
              <p class="text-sm text-highlighted leading-snug">
                <span class="font-medium">{{ ev.actor_id ? 'Team member' : 'System' }}</span>
                {{ eventLabel(ev.event_type) }}
                <span v-if="ev.location_title" class="text-muted"> · {{ ev.location_title }}</span>
              </p>
              <p class="text-xs text-muted mt-0.5">{{ timeAgo(ev.created_at) }}</p>
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

const { eventLabel } = useSiteEventLabels()
const { formatRelativeTime: timeAgo } = useHumanTime()
const dashboard = useDashboardOrganization()
const loadMoreError = ref<string | null>(null)

type SiteEvent = import('~/server/utils/dashboard-events').DashboardEvent

// Nuxt UI's SelectItem throws if given an empty-string value (it's reserved
// internally for clearing the selection) — use a distinct sentinel for the
// "no filter" option instead of ''.
const FILTER_ALL = '__all__'

const filters = reactive({
  locationId: FILTER_ALL,
  eventType: FILTER_ALL,
  actorId: FILTER_ALL,
})

const eventTypeOptions = computed(() => [
  { label: 'All types', value: FILTER_ALL },
  ...SITE_EVENT_TYPES.map(type => ({ label: eventLabel(type), value: type })),
])

interface Member { userId: string; name: string }
const membersKey = computed(() => `dashboard-activity-members-${String(route.params.orgSlug ?? '')}`)
// Not awaited: the events read below does not depend on it (eventQuery is built
// from the filters, not from members), and its only consumer is the reactive
// actorOptions computed. Awaiting it here made the feed's two independent reads
// into two serial round trips before anything could render.
const { data: membersData } = useAsyncData<{ members: Member[] }>(
  membersKey,
  () => dashboardApi<{ members: Member[] }>('/api/dashboard/members', {
    validate: (value): value is { members: Member[] } =>
      isRecord(value)
      && Array.isArray(value.members)
      && value.members.every(member =>
        isRecord(member)
        && typeof member.userId === 'string'
        && typeof member.name === 'string',
      ),
  }),
  { lazy: true },
)
const actorOptions = computed(() => [
  { label: 'Everyone', value: FILTER_ALL },
  ...(membersData.value?.members ?? []).map(m => ({ label: m.name, value: m.userId })),
])

interface Location { id: string; title: string }
// The feed covers one tenant, so there is no site to pick before a location:
// the organization's locations are the only ones there are.
const locationsForOrganization = ref<Location[]>([])
const locationsError = ref<string | null>(null)
watch(() => dashboard.organizationId.value, async (organizationId) => {
  locationsError.value = null
  filters.locationId = FILTER_ALL
  locationsForOrganization.value = []
  if (!organizationId) return
  try {
    const res = await dashboardApi<{ locations: Location[] }>('/api/dashboard/locations', {
      validate: (value): value is { locations: Location[] } =>
        isRecord(value)
        && Array.isArray(value.locations)
        && value.locations.every(location =>
          isRecord(location)
          && typeof location.id === 'string'
          && typeof location.title === 'string',
        ),
    })
    // A slower earlier request must not land after the tenant moved on.
    if (dashboard.organizationId.value !== organizationId) return
    locationsForOrganization.value = res.locations
  } catch (err) {
    if (dashboard.organizationId.value !== organizationId) return
    locationsError.value = 'Failed to load locations'
    if (import.meta.dev) console.error('Failed to load locations:', err)
  }
}, { immediate: true })
const locationOptions = computed(() => [
  { label: 'All locations', value: FILTER_ALL },
  ...locationsForOrganization.value.map(l => ({ label: l.title, value: l.id })),
])

const eventQuery = computed(() => ({
  limit: 20,
  locationId: filters.locationId !== FILTER_ALL ? filters.locationId : undefined,
  eventType: filters.eventType !== FILTER_ALL ? filters.eventType : undefined,
  actorId: filters.actorId !== FILTER_ALL ? filters.actorId : undefined,
}))
const eventsKey = computed(() =>
  `dashboard-events-${String(route.params.orgSlug ?? '')}-${JSON.stringify(eventQuery.value)}`,
)
const isEventsResponse = (value: unknown): value is { events: SiteEvent[]; nextCursor: string | null } =>
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
  () => dashboardApi<{ events: SiteEvent[]; nextCursor: string | null }>(
    '/api/dashboard/events',
    { query: eventQuery.value, validate: isEventsResponse },
  ),
  // Nuxt blocks navigation on useAsyncData by default; the client does not
  // need to wait for this to paint the route, and `pending` already drives a
  // loading state here.
  { watch: [eventQuery], lazy: true },
)
const events = ref<SiteEvent[]>([])
const nextCursor = ref<string | null>(null)
watch(eventsData, (value) => {
  events.value = value?.events ?? []
  nextCursor.value = value?.nextCursor ?? null
}, { immediate: true })
const loadingMore = ref(false)

async function fetchEvents(before?: string) {
  return await dashboardApi<{ events: SiteEvent[]; nextCursor: string | null }>(
    '/api/dashboard/events',
    { query: { ...eventQuery.value, before }, validate: isEventsResponse },
  )
}

async function loadMore() {
  if (loadingMore.value) return
  if (!nextCursor.value) return
  // Capture the key/cursor before awaiting — if a filter changes while this
  // request is in flight, eventsKey changes and the main useAsyncData watch
  // resets events/nextCursor to the new filter's first page. Applying this
  // request's (now-stale) result afterward would append old-filter events
  // onto the new list and clobber the new cursor.
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
    loadMoreError.value = err instanceof Error ? err.message : 'Failed to load more activity'
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
  const map = new Map<string, SiteEvent[]>()
  for (const ev of events.value) {
    const label = groupLabel(ev.created_at)
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(ev)
  }
  return Array.from(map.entries()).map(([label, evs]) => ({ label, events: evs }))
})
</script>
