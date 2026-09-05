<template>
  <UDashboardPanel id="org-today">
    <template #header>
      <!--
        Today keeps the navbar every other node has. The range switcher rides in
        its centre slot rather than the body, so the page opens on content the
        way the booking screens do.
      -->
      <!--
        The title is announced but not drawn: the pills say which range is on
        screen, and a "Today" heading beside a "Today" pill reads as two
        different controls.
      -->
      <UDashboardNavbar title="Today" :toggle="false" :ui="{ title: 'sr-only', center: 'flex flex-1 items-center justify-center' }">
        <UTabs
          v-model="rangeModel"
          :items="ranges"
          :content="false"
          size="lg"
          aria-label="Booking range"
        />

        <template #right>
          <UPopover v-model:open="filtersOpen" :content="{ align: 'end', side: 'bottom', sideOffset: 10 }">
            <UButton
              icon="i-lucide-sliders-horizontal"
              :color="hasActiveFilters ? 'primary' : 'neutral'"
              :variant="hasActiveFilters ? 'solid' : 'soft'"
              square
              aria-label="Filter bookings"
            />

            <template #content>
              <div class="w-72 space-y-4 p-4">
                <div class="flex items-center justify-between gap-3">
                  <p class="font-semibold text-highlighted">Filters</p>
                  <UButton v-if="hasActiveFilters" label="Clear" color="neutral" variant="ghost" size="xs" @click="clearFilters" />
                </div>
                <UFormField label="Site">
                  <USelect v-model="filters.siteId" :items="siteOptions" class="w-full" />
                </UFormField>
                <UFormField label="Location">
                  <USelect v-model="filters.locationId" :items="locationOptions" :disabled="filters.siteId === FILTER_ALL" class="w-full" />
                </UFormField>
                <UFormField label="Booking type">
                  <USelect v-model="filters.kind" :items="kindOptions" class="w-full" />
                </UFormField>
              </div>
            </template>
          </UPopover>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-[var(--ws-page-reading,56rem)] pb-24">
        <UAlert
          v-if="realtime.status.value === 'failed'"
          class="mb-6"
          color="warning"
          variant="soft"
          icon="i-lucide-wifi-off"
          title="Today's schedule may be out of date"
          description="The live dashboard connection is unavailable."
        >
          <template #actions>
            <UButton color="warning" variant="soft" size="xs" @click="retryRealtime">Refresh</UButton>
          </template>
        </UAlert>
        <UAlert
          v-if="activeError"
          class="mb-6"
          color="error"
          variant="soft"
          :title="`${activeLabel} could not be loaded`"
          :description="getErrorMessage(activeError, `${activeLabel} request failed`)"
        />

        <h1 class="text-center text-2xl font-semibold text-highlighted">
          {{ heading }}
        </h1>

        <div v-if="pending && !todayData" class="mt-6 space-y-4" aria-label="Loading today">
          <USkeleton v-for="index in 4" :key="index" class="h-36 w-full rounded-2xl sm:h-40" />
        </div>

        <template v-else>
          <div v-if="visibleItems.length" class="mt-6 space-y-4">
            <TodayAgendaCard
              v-for="item in visibleItems"
              :key="item.id"
              :item="item"
              :reference-day="referenceDay(item)"
            />
          </div>

          <div v-else-if="!activeLoading && !activeError" class="py-24 text-center">
            <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
              <UIcon :name="activeRange === 'today' ? 'i-lucide-sun' : 'i-lucide-calendar-days'" class="size-7 text-muted" />
            </div>
            <p class="mt-4 font-medium text-highlighted">{{ emptyTitle }}</p>
            <p class="mt-1 text-sm text-muted">{{ emptyDescription }}</p>
          </div>

          <div
            v-if="hasMore"
            :key="`${activeRange}-${filterSignature}`"
            ref="loadMoreSentinel"
            class="flex min-h-24 items-center justify-center"
            aria-live="polite"
          >
            <UIcon v-if="activeLoading" name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
            <span v-else class="sr-only">Scroll to load more</span>
          </div>
        </template>

        <!--
          Triage is a band, not a badge on every row. Marking each card with its
          status makes the operator read all of them to find the one waiting on
          a reply; naming the count once, pinned, does not. It stays out of the
          list so the cards keep the single shape they were redesigned for.
        -->
        <div v-if="attentionCount" class="sticky bottom-4 z-10 mt-4">
          <UButton
            color="neutral"
            variant="solid"
            size="lg"
            block
            class="justify-start shadow-lg"
            :aria-pressed="attentionOnly"
            @click="attentionOnly = !attentionOnly"
          >
            <UIcon name="i-lucide-circle-alert" class="size-5 shrink-0 text-warning" />
            <span class="min-w-0 text-left">
              <span class="block">{{ attentionCount }} {{ attentionCount === 1 ? 'needs' : 'need' }} your response</span>
              <span class="mt-0.5 block text-sm font-normal opacity-80">{{ attentionOnly ? 'Showing only these' : 'Show only these' }}</span>
            </span>
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import TodayAgendaCard from './TodayAgendaCard.vue'
import { bookingNeedsResponse } from '~/utils/booking-lifecycle'
import { bookingCountLabel, resolveAggregateBookingPresentation, type BookingKind } from '~/utils/booking-presentation'
import { getErrorMessage } from '~/utils/errors'
import type { AgendaItem, AgendaKind, AgendaLocation, AgendaPayload, AgendaSite, TodayAgendaPayload } from '~/server/utils/dashboard-agenda'

useSeoMeta({ title: 'Today | KrabiClaw', robots: 'noindex, nofollow' })

type TodayRange = 'today' | 'upcoming'

const FILTER_ALL = '__all__'
const PAGE_SIZE = 12
const UPCOMING_WINDOW_DAYS = 30
const UPCOMING_HORIZON_DAYS = 365
const BOOKING_KINDS: AgendaKind[] = ['reservation', 'experience_booking']

const ranges: Array<{ label: string; value: TodayRange }> = [
  { label: 'Today', value: 'today' },
  { label: 'Upcoming', value: 'upcoming' },
]

const route = useRoute()
const dashboard = useDashboardSite()
const dashboardApi = useDashboardApi()
const realtime = useDashboardInvalidations()
const requestEvent = useRequestEvent()
const orgSlug = computed(() => String(route.params.orgSlug ?? ''))
const todayKey = computed(() => `dashboard-today-${orgSlug.value}`)
const filters = reactive({ siteId: FILTER_ALL, locationId: FILTER_ALL, kind: FILTER_ALL })
const filtersOpen = ref(false)

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isAgendaItem = (value: unknown): value is AgendaItem =>
  isRecord(value)
  && typeof value.id === 'string'
  && BOOKING_KINDS.includes(value.kind as AgendaKind)
  && typeof value.startsAt === 'string'
  && typeof value.dayKey === 'string'
  && typeof value.timeZone === 'string'
  && typeof value.title === 'string'
  && typeof value.status === 'string'
  && typeof value.siteId === 'string'
  && isNullableString(value.guestImageUrl)
  && isNullableString(value.resourceImageUrl)
  && isNullableString(value.resourceTitle)
  && (value.partySize === null || typeof value.partySize === 'number')
  && typeof value.to === 'string'

const isSite = (value: unknown): value is AgendaSite =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.label === 'string'
  && typeof value.slug === 'string'
  && typeof value.vertical === 'string'

const isLocation = (value: unknown): value is AgendaLocation =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.siteId === 'string'
  && typeof value.title === 'string'

const isTodayResponse = (value: unknown): value is TodayAgendaPayload =>
  isRecord(value)
  && Array.isArray(value.items)
  && value.items.every(isAgendaItem)
  && Array.isArray(value.availableKinds)
  && Array.isArray(value.sites)
  && value.sites.every(isSite)
  && Array.isArray(value.locations)
  && value.locations.every(isLocation)
  && typeof value.resolvedAt === 'string'

const isAgendaPayload = (value: unknown): value is AgendaPayload =>
  isRecord(value)
  && Array.isArray(value.items)
  && value.items.every(isAgendaItem)
  && Array.isArray(value.availableKinds)
  && Array.isArray(value.sites)
  && value.sites.every(isSite)
  && Array.isArray(value.locations)
  && value.locations.every(isLocation)

const { data: todayData, pending, error: todayError, refresh: refreshToday } = await useAsyncData<TodayAgendaPayload>(todayKey, async () => {
  if (import.meta.server) {
    if (!requestEvent || !dashboard.organization.value) {
      throw createError({ statusCode: 500, statusMessage: 'Dashboard context unavailable' })
    }
    const [{ getDashboardContext }, { listTodayAgenda }] = await Promise.all([
      import('~/server/utils/dashboard-context'),
      import('~/server/utils/dashboard-agenda'),
    ])
    const context = await getDashboardContext(requestEvent, { requireSite: false, organizationSlug: orgSlug.value })
    return await listTodayAgenda(context.db, context.organization.id, {
      organizationSlug: orgSlug.value,
      principal: { env: context.env, memberId: context.organization.memberId, role: context.organization.role },
    })
  }
  return await dashboardApi<TodayAgendaPayload>('/api/dashboard/today', { validate: isTodayResponse })
})

const activeRange = ref<TodayRange>('today')
// UTabs models `string | number`; the setter is where Upcoming is loaded on
// first selection, so switching range stays one code path.
const rangeModel = computed<string | number>({
  get: () => activeRange.value,
  set: value => void selectRange(value === 'upcoming' ? 'upcoming' : 'today'),
})
const attentionOnly = ref(false)
const todayVisibleCount = ref(PAGE_SIZE)
const upcomingItems = ref<AgendaItem[]>([])
const upcomingLoading = ref(false)
const upcomingError = ref<unknown>(null)
const resolvedAt = computed(() => todayData.value?.resolvedAt ?? new Date().toISOString())
const resolvedUtcDay = computed(() => resolvedAt.value.slice(0, 10))
// One organization can span time zones. Query one day on either side of the
// UTC range, then classify each item against its own location's local day.
const upcomingCursor = ref(addDays(resolvedUtcDay.value, -1))
const upcomingHorizon = computed(() => addDays(resolvedUtcDay.value, UPCOMING_HORIZON_DAYS + 1))
const filterSignature = computed(() => `${filters.siteId}:${filters.locationId}:${filters.kind}`)

const filteredTodayItems = computed(() => (todayData.value?.items ?? []).filter(item =>
  (filters.siteId === FILTER_ALL || item.siteId === filters.siteId)
  && (filters.locationId === FILTER_ALL || item.locationId === filters.locationId)
  && (filters.kind === FILTER_ALL || item.kind === filters.kind)))
const allRangeItems = computed(() => activeRange.value === 'today' ? filteredTodayItems.value : upcomingItems.value)
const rangeItems = computed(() => activeRange.value === 'today'
  ? filteredTodayItems.value.slice(0, todayVisibleCount.value)
  : upcomingItems.value)
const visibleItems = computed(() => attentionOnly.value ? allRangeItems.value.filter(needsResponse) : rangeItems.value)
const attentionCount = computed(() => allRangeItems.value.filter(needsResponse).length)
const hasMore = computed(() => activeRange.value === 'today'
  ? !attentionOnly.value && todayVisibleCount.value < filteredTodayItems.value.length
  : upcomingCursor.value <= upcomingHorizon.value)
const activeLoading = computed(() => activeRange.value === 'today' ? pending.value : upcomingLoading.value)
const activeError = computed(() => activeRange.value === 'today' ? todayError.value : upcomingError.value)
const activeLabel = computed(() => activeRange.value === 'today' ? 'Today' : 'Upcoming')
const hasActiveFilters = computed(() => filters.siteId !== FILTER_ALL || filters.locationId !== FILTER_ALL || filters.kind !== FILTER_ALL)
// Derived from the sites and kinds in scope rather than from the loaded items,
// so the heading reads the same before anything has arrived and does not change
// noun as a page of Upcoming loads.
const presentation = computed(() => {
  const sites = filters.siteId === FILTER_ALL
    ? todayData.value?.sites ?? []
    : (todayData.value?.sites ?? []).filter(site => site.id === filters.siteId)
  const scoped: AgendaKind[] = filters.kind === FILTER_ALL
    ? todayData.value?.availableKinds ?? BOOKING_KINDS
    : [filters.kind as AgendaKind]
  const kinds = scoped.filter(isBookingKind)
  return resolveAggregateBookingPresentation(
    sites.flatMap(site => kinds.map(kind => ({ kind, vertical: site.vertical }))),
  )
})
const heading = computed(() => {
  const count = attentionOnly.value ? attentionCount.value : allRangeItems.value.length
  return `You have ${bookingCountLabel(presentation.value, count)}`
})
const emptyTitle = computed(() => activeRange.value === 'today'
  ? `No ${presentation.value.nounPlural} today`
  : `No upcoming ${presentation.value.nounPlural}`)
const emptyDescription = computed(() => hasActiveFilters.value
  ? 'Try adjusting the filters.'
  : activeRange.value === 'today'
    ? 'There are no arrivals scheduled for today.'
    : 'New arrivals will appear here as they are booked.')

const siteOptions = computed(() => [
  { label: 'All sites', value: FILTER_ALL },
  ...(todayData.value?.sites ?? []).map(site => ({ label: site.label, value: site.id })),
])
const locationOptions = computed(() => [
  { label: 'All locations', value: FILTER_ALL },
  ...(todayData.value?.locations ?? [])
    .filter(location => location.siteId === filters.siteId)
    .map(location => ({ label: location.title, value: location.id })),
])
const kindOptions = computed(() => [
  { label: 'All booking types', value: FILTER_ALL },
  ...(todayData.value?.availableKinds ?? []).map(kind => ({ label: kind === 'reservation' ? 'Reservations' : 'Experience bookings', value: kind })),
])

async function selectRange(range: TodayRange) {
  activeRange.value = range
  if (range === 'upcoming' && upcomingItems.value.length === 0 && !upcomingLoading.value) {
    await loadUpcoming()
  }
}

function clearFilters() {
  filters.siteId = FILTER_ALL
  filters.locationId = FILTER_ALL
  filters.kind = FILTER_ALL
}

async function loadMore() {
  if (activeLoading.value || !hasMore.value) return
  if (activeRange.value === 'today') {
    todayVisibleCount.value += PAGE_SIZE
    return
  }
  await loadUpcoming()
}

async function loadUpcoming() {
  if (upcomingLoading.value || upcomingCursor.value > upcomingHorizon.value) return
  upcomingLoading.value = true
  upcomingError.value = null
  const requestSignature = filterSignature.value
  try {
    while (upcomingCursor.value <= upcomingHorizon.value && requestSignature === filterSignature.value) {
      const from = upcomingCursor.value
      const to = minDate(addDays(from, UPCOMING_WINDOW_DAYS - 1), upcomingHorizon.value)
      const payload = await dashboardApi<AgendaPayload>('/api/dashboard/agenda', {
        query: {
          from,
          to,
          siteId: filters.siteId !== FILTER_ALL ? filters.siteId : undefined,
          locationId: filters.locationId !== FILTER_ALL ? filters.locationId : undefined,
          kinds: filters.kind !== FILTER_ALL ? filters.kind : 'reservation, experience_booking',
        },
        validate: isAgendaPayload,
      })
      if (requestSignature !== filterSignature.value) return
      const existing = new Set(upcomingItems.value.map(item => item.id))
      const additions = payload.items.filter(item => isUpcoming(item) && !existing.has(item.id))
      upcomingItems.value.push(...additions)
      upcomingItems.value.sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id))
      upcomingCursor.value = addDays(to, 1)
      if (additions.length) break
    }
  } catch (error) {
    if (requestSignature === filterSignature.value) upcomingError.value = error
  } finally {
    if (requestSignature === filterSignature.value) upcomingLoading.value = false
  }
}

async function refreshAgenda() {
  upcomingItems.value = []
  upcomingError.value = null
  upcomingCursor.value = addDays(resolvedUtcDay.value, -1)
  await refreshToday()
  if (activeRange.value === 'upcoming') await loadUpcoming()
}

function retryRealtime() {
  realtime.connect()
  void refreshAgenda()
}

// `AgendaKind` still admits 'post'; Today only ever lists the two booking kinds
// (`isAgendaItem` rejects the rest), so this narrows the type rather than
// standing in for missing data.
function isBookingKind(kind: AgendaKind): kind is BookingKind {
  return kind === 'reservation' || kind === 'experience_booking'
}

function needsResponse(item: AgendaItem): boolean {
  return isBookingKind(item.kind) && bookingNeedsResponse(item.kind, item.status)
}

function referenceDay(item: AgendaItem): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: item.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(resolvedAt.value))
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function isUpcoming(item: AgendaItem): boolean {
  return item.dayKey > referenceDay(item)
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function minDate(left: string, right: string): string {
  return left < right ? left : right
}

watch(() => filters.siteId, () => { filters.locationId = FILTER_ALL })
// Nothing outstanding left to show, so drop the filter rather than leaving the
// list empty behind a band that is no longer on screen to switch off.
watch(attentionCount, (count) => {
  if (!count) attentionOnly.value = false
})

watch(filterSignature, async () => {
  attentionOnly.value = false
  todayVisibleCount.value = PAGE_SIZE
  upcomingItems.value = []
  upcomingLoading.value = false
  upcomingError.value = null
  upcomingCursor.value = addDays(resolvedUtcDay.value, -1)
  if (activeRange.value === 'upcoming') await loadUpcoming()
}, { flush: 'post' })

watch(realtime.event, (event) => {
  if (event?.type === 'thread.created' || event?.type === 'thread.changed') void refreshAgenda()
})
watch(realtime.connectionEpoch, (epoch) => {
  if (epoch > 0) void refreshAgenda()
})

const loadMoreSentinel = ref<HTMLElement | null>(null)
let loadMoreObserver: IntersectionObserver | null = null

onMounted(() => {
  if (!('IntersectionObserver' in window)) return
  loadMoreObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) void loadMore()
  }, { rootMargin: '320px 0px' })
  if (loadMoreSentinel.value) loadMoreObserver.observe(loadMoreSentinel.value)
})

watch(loadMoreSentinel, (element, previous) => {
  if (previous) loadMoreObserver?.unobserve(previous)
  if (element) loadMoreObserver?.observe(element)
}, { flush: 'post' })

onBeforeUnmount(() => loadMoreObserver?.disconnect())
</script>
