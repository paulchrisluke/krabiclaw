<template>
  <UPage>
    <UPageBody>
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

          <ClientOnly>
            <template #fallback>
              <div v-if="pending" class="space-y-3">
                <USkeleton v-for="i in 5" :key="i" class="h-12 w-full" />
              </div>
            </template>

            <div v-if="pending && groups.length === 0" class="space-y-3">
              <USkeleton v-for="i in 5" :key="i" class="h-12 w-full" />
            </div>

            <div v-else-if="groups.length === 0" class="py-16 text-center">
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
          </ClientOnly>
        </UCard>

      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Activity | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const { eventLabel, timeAgo } = useSiteEventLabels()
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const toast = useToast()

// Bare $fetch (globalThis override in dashboard-site-header.client.ts) does not
// forward cookies during SSR — must attach them explicitly, same as useDashboardSite.ts.
const requestHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

interface SiteEvent {
  id: string; event_type: string; site_id: string; location_id: string | null
  metadata: Record<string, unknown> | null; created_at: string
  actor_id: string | null; actor_name: string | null; actor_image: string | null
  location_title: string | null
}

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
const { data: membersData } = await useFetch<{ members: Member[] }>('/api/dashboard/members')
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
  const res = await $fetch<{ locations: Location[] }>('/api/dashboard/locations', {
    headers: { ...requestHeaders, 'x-dashboard-site-slug': site.subdomain },
  })
  locationsForSite.value = res.locations
})
const locationOptions = computed(() => [
  { label: 'All locations', value: '' },
  ...locationsForSite.value.map(l => ({ label: l.title, value: l.id })),
])

const events = ref<SiteEvent[]>([])
const nextCursor = ref<string | null>(null)
const pending = ref(false)
const loadingMore = ref(false)
const requestToken = ref(0)

async function fetchEvents(before?: string) {
  const query: Record<string, string> = { limit: '20' }
  if (filters.siteId) query.siteId = filters.siteId
  if (filters.locationId) query.locationId = filters.locationId
  if (filters.eventType) query.eventType = filters.eventType
  if (filters.actorId) query.actorId = filters.actorId
  if (before) query.before = before

  return $fetch<{ events: SiteEvent[]; nextCursor: string | null }>('/api/dashboard/events', { query, headers: requestHeaders })
}

async function reload() {
  const currentToken = ++requestToken.value
  pending.value = true
  try {
    const res = await fetchEvents()
    if (currentToken !== requestToken.value) return
    events.value = res.events
    nextCursor.value = res.nextCursor
  } catch (err) {
    if (currentToken !== requestToken.value) return
    toast.add({ title: 'Failed to load activity', description: err instanceof Error ? err.message : 'Please try again.', color: 'error' })
  } finally {
    if (currentToken === requestToken.value) pending.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value) return
  const currentToken = ++requestToken.value
  loadingMore.value = true
  try {
    const res = await fetchEvents(nextCursor.value)
    if (currentToken !== requestToken.value) return
    events.value = [...events.value, ...res.events]
    nextCursor.value = res.nextCursor
  } catch (err) {
    if (currentToken !== requestToken.value) return
    toast.add({ title: 'Failed to load more activity', description: err instanceof Error ? err.message : 'Please try again.', color: 'error' })
  } finally {
    if (currentToken === requestToken.value) loadingMore.value = false
  }
}

watch([() => filters.siteId, () => filters.locationId, () => filters.eventType, () => filters.actorId], reload)
await reload()

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
