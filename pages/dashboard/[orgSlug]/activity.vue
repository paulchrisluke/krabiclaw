<template>
  <UDashboardPanel id="org-activity">
    <template #header>
      <UDashboardNavbar title="Activity">
        <template #leading>
          <DashboardNavbarLeading :to="orgPaths.org" label="Organization" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-3xl space-y-6">

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Activity</h2>
          </template>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <UFormField label="Site">
              <USelect v-model="filters.siteId" :items="siteOptions" class="w-full" />
            </UFormField>
            <UFormField label="Location">
              <USelect v-model="filters.locationId" :items="locationOptions" :disabled="filters.siteId === FILTER_ALL" class="w-full" />
            </UFormField>
            <UFormField label="Type">
              <USelect v-model="filters.eventType" :items="eventTypeOptions" class="w-full" />
            </UFormField>
            <UFormField label="Actor">
              <USelect v-model="filters.actorId" :items="actorOptions" class="w-full" />
            </UFormField>
          </div>

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
              </div>
            </div>
        </UCard>

      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'
const dashboardApi = useDashboardApi()
const route = useRoute()
definePageMeta({ layout: 'dashboard' })

const { orgPaths } = useDashboardSiteLinks()
useSeoMeta({ title: 'Activity | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const { eventLabel } = useSiteEventLabels()
const { formatRelativeTime: timeAgo } = useHumanTime()
const dashboard = useDashboardSite()
const toast = useToast()

type SiteEvent = import('~/server/utils/dashboard-events').DashboardEvent

// Nuxt UI's SelectItem throws if given an empty-string value (it's reserved
// internally for clearing the selection) — use a distinct sentinel for the
// "no filter" option instead of ''.
const FILTER_ALL = '__all__'

const filters = reactive({
  siteId: FILTER_ALL,
  locationId: FILTER_ALL,
  eventType: FILTER_ALL,
  actorId: FILTER_ALL,
})

const siteOptions = computed(() => [
  { label: 'All sites', value: FILTER_ALL },
  ...dashboard.sites.value.map(s => ({ label: s.brand_name ?? s.subdomain ?? s.id, value: s.id })),
])

const eventTypeOptions = computed(() => [
  { label: 'All types', value: FILTER_ALL },
  ...SITE_EVENT_TYPES.map(type => ({ label: eventLabel(type), value: type })),
])

interface Member { userId: string; name: string }
const requestEvent = useRequestEvent()
const membersKey = computed(() => `dashboard-activity-members-${String(route.params.orgSlug ?? '')}`)
const { data: membersData } = await useAsyncData<{ members: Member[] }>(membersKey, async () => {
  if (import.meta.server) {
    if (!requestEvent || !dashboard.organization.value?.id) {
      throw createError({ statusCode: 500, statusMessage: 'Dashboard member context unavailable' })
    }
    const [{ cloudflareEnv }, { getOrganizationMembersData }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/dashboard-members'),
    ])
    const env = cloudflareEnv(requestEvent)
    if (!env.DB) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
    const result = await getOrganizationMembersData(env, dashboard.organization.value.id)
    return { members: result.members }
  }
  return await dashboardApi<{ members: Member[] }>('/api/dashboard/members', {
    validate: (value): value is { members: Member[] } =>
      isRecord(value)
      && Array.isArray(value.members)
      && value.members.every(member =>
        isRecord(member)
        && typeof member.userId === 'string'
        && typeof member.name === 'string',
      ),
  })
})
const actorOptions = computed(() => [
  { label: 'Everyone', value: FILTER_ALL },
  ...(membersData.value?.members ?? []).map(m => ({ label: m.name, value: m.userId })),
])

interface Location { id: string; title: string }
const locationsForSite = ref<Location[]>([])
watch(() => filters.siteId, async (siteId) => {
  filters.locationId = FILTER_ALL
  locationsForSite.value = []
  if (siteId === FILTER_ALL) return
  const site = dashboard.sites.value.find(s => s.id === siteId)
  if (!site?.subdomain) return
  try {
    // Reused for requests that deliberately override the active site while retaining
    // the organization scope resolved from this dashboard route.
    const res = await dashboardApi<{ locations: Location[] }>('/api/dashboard/locations', {
      query: { site: site.subdomain },
      validate: (value): value is { locations: Location[] } =>
        isRecord(value)
        && Array.isArray(value.locations)
        && value.locations.every(location =>
          isRecord(location)
          && typeof location.id === 'string'
          && typeof location.title === 'string',
        ),
    })
    locationsForSite.value = res.locations
  } catch (err) {
    toast.add({ title: 'Failed to load locations', description: err instanceof Error ? err.message : 'Please try again.', color: 'error' })
  }
})
const locationOptions = computed(() => [
  { label: 'All locations', value: FILTER_ALL },
  ...locationsForSite.value.map(l => ({ label: l.title, value: l.id })),
])

const eventQuery = computed(() => ({
  limit: 20,
  siteId: filters.siteId !== FILTER_ALL ? filters.siteId : undefined,
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
    && typeof event.site_id === 'string'
    && typeof event.created_at === 'string',
  )
  && (value.nextCursor === null || typeof value.nextCursor === 'string')

const { data: eventsData, pending, error: eventsError } = await useAsyncData(
  eventsKey,
  async () => {
    if (import.meta.server) {
      if (!requestEvent || !dashboard.organization.value?.id) {
        throw createError({ statusCode: 500, statusMessage: 'Dashboard event context unavailable' })
      }
      const [{ cloudflareEnv }, { listDashboardEvents }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/dashboard-events'),
      ])
      const db = cloudflareEnv(requestEvent).DB
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      return await listDashboardEvents(db, dashboard.organization.value.id, eventQuery.value)
    }
    return await dashboardApi<{ events: SiteEvent[]; nextCursor: string | null }>(
      '/api/dashboard/events',
      { query: eventQuery.value, validate: isEventsResponse },
    )
  },
  { watch: [eventQuery] },
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
  try {
    const res = await fetchEvents(cursor)
    if (requestedKey !== eventsKey.value) return
    events.value = [...events.value, ...res.events]
    nextCursor.value = res.nextCursor
  } catch (err) {
    toast.add({ title: 'Failed to load more activity', description: err instanceof Error ? err.message : 'Please try again.', color: 'error' })
  } finally {
    loadingMore.value = false
  }
}

// Fixed, explicit zone/locale rather than the host's — Date.toDateString(),
// getFullYear(), and Intl.DateTimeFormat(undefined, ...) all read the running
// process's local time zone, which differs between the SSR server and the
// client's browser and produces mismatched "Today"/"Yesterday" grouping (and
// a hydration mismatch) for the same event.
const ACTIVITY_TIME_ZONE = 'UTC'
const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ACTIVITY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const dateKey = (date: Date) => dateKeyFormatter.format(date)

function groupLabel(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const todayKey = dateKey(now)
  const key = dateKey(date)
  if (key === todayKey) return 'Today'
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (key === dateKey(yesterday)) return 'Yesterday'
  const sameYear = key.slice(0, 4) === todayKey.slice(0, 4)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ACTIVITY_TIME_ZONE,
    ...(sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', year: 'numeric' }),
  }).format(date)
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
