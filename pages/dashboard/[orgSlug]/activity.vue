<template>
  <UDashboardPanel id="org-activity">
    <template #header>
      <UDashboardNavbar title="Activity">
        <template #leading>
          <DashboardSidebarCollapseButton />
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
              <USelect v-model="filters.locationId" :items="locationOptions" :disabled="!filters.siteId" class="w-full" />
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
                    <UAvatar :src="ev.actor_image ?? undefined" :alt="ev.actor_name ?? 'System'" size="2xs" class="mt-0.5 shrink-0" />
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-highlighted leading-snug">
                        <span class="font-medium">{{ ev.actor_name ?? 'System' }}</span>
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
const dashboardApi = useDashboardApi()
const route = useRoute()
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Activity | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const { eventLabel } = useSiteEventLabels()
const { formatRelativeTime: timeAgo } = useHumanTime()
const dashboard = useDashboardSite()
const toast = useToast()

type SiteEvent = import('~/server/utils/dashboard-events').DashboardEvent

const filters = reactive({
  siteId: '',
  locationId: '',
  eventType: '',
  actorId: '',
})

const siteOptions = computed(() => [
  { label: 'All sites', value: '' },
  ...dashboard.sites.value.map(s => ({ label: s.brand_name ?? s.subdomain ?? s.id, value: s.id })),
])

const eventTypeOptions = computed(() => [
  { label: 'All types', value: '' },
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
    const db = cloudflareEnv(requestEvent).DB
    if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
    const result = await getOrganizationMembersData(db, dashboard.organization.value.id)
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
  { label: 'Everyone', value: '' },
  ...(membersData.value?.members ?? []).map(m => ({ label: m.name, value: m.userId })),
])

interface Location { id: string; title: string }
const locationsForSite = ref<Location[]>([])
watch(() => filters.siteId, async (siteId) => {
  filters.locationId = ''
  locationsForSite.value = []
  if (!siteId) return
  const site = dashboard.sites.value.find(s => s.id === siteId)
  if (!site?.subdomain) return
  try {
    // Reused for requests that deliberately override the active site while retaining
    // the organization scope resolved from this dashboard route.
    const res = await dashboardApi<{ locations: Location[] }>('/api/dashboard/locations', {
      headers: { 'x-dashboard-site-slug': site.subdomain },
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
  { label: 'All locations', value: '' },
  ...locationsForSite.value.map(l => ({ label: l.title, value: l.id })),
])

const eventQuery = computed(() => ({
  limit: 20,
  siteId: filters.siteId || undefined,
  locationId: filters.locationId || undefined,
  eventType: filters.eventType || undefined,
  actorId: filters.actorId || undefined,
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
  if (!nextCursor.value) return
  loadingMore.value = true
  try {
    const res = await fetchEvents(nextCursor.value)
    events.value = [...events.value, ...res.events]
    nextCursor.value = res.nextCursor
  } catch (err) {
    toast.add({ title: 'Failed to load more activity', description: err instanceof Error ? err.message : 'Please try again.', color: 'error' })
  } finally {
    loadingMore.value = false
  }
}

function groupLabel(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const isSameDay = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(undefined, sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', year: 'numeric' }).format(date)
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
