<template>
  <DashboardIndexPanel id="org-calendar" title="Calendar">
    <template #right>
      <div class="flex items-center gap-2">
        <USelect v-model="filters.locationId" :items="locationOptions" size="sm" class="w-44" aria-label="Location" />
        <USelect v-model="filters.kind" :items="kindOptions" size="sm" class="w-36" aria-label="Kind" />
      </div>
    </template>

    <div class="mx-auto w-full max-w-3xl pb-28">
      <!-- One weekday bar for every month below it, as Airbnb's calendar draws it. -->
      <div class="sticky -top-4 z-10 -mx-4 -mt-4 grid grid-cols-7 border-b border-default bg-default px-4 pb-2 pt-6 text-center text-xs font-medium text-muted sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-8">
        <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
      </div>

      <UAlert
        v-if="agendaError"
        class="mt-6"
        color="error"
        variant="soft"
        title="Calendar could not be loaded"
        :description="getErrorMessage(agendaError, 'Calendar request failed')"
      />

      <section
        v-for="month in months"
        :key="month.key"
        :ref="(el) => registerMonth(month.key, el)"
        :data-month="month.key"
        class="pt-8"
      >
        <h2 class="mb-4 px-1 text-2xl font-semibold text-highlighted">{{ month.label }}</h2>

        <USkeleton v-if="month.status === 'loading'" class="h-80 w-full" />

        <UCalendar
          v-else
          :placeholder="month.first"
          :model-value="selectedDate"
          :month-controls="false"
          :year-controls="false"
          :view-control="false"
          :fixed-weeks="false"
          :week-starts-on="0"
          :ui="calendarUi"
          :is-date-unavailable="isUnavailable"
          @update:model-value="selectDay"
        >
          <template #day="{ day }">
            <span
              class="flex size-7 items-center justify-center rounded-full text-sm font-medium"
              :class="isToday(day) ? 'bg-primary text-inverted' : isUnavailable(day) ? 'text-muted line-through' : 'text-highlighted'"
            >{{ day.day }}</span>
            <span v-if="countFor(day)" class="mt-1 text-xs tabular-nums text-muted">{{ countFor(day) }}</span>
          </template>
        </UCalendar>

      </section>

      <div ref="sentinel" class="h-px" />
    </div>

    <!-- Airbnb's floating Today: appears once today has scrolled away, and brings it back. -->
    <UButton
      v-if="!todayInView"
      icon="i-lucide-arrow-up"
      label="Today"
      color="neutral"
      variant="solid"
      size="lg"
      class="fixed bottom-24 right-6 z-20 rounded-full shadow-lg lg:bottom-8"
      @click="scrollToToday"
    />
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { ComponentPublicInstance, InjectionKey, Ref } from 'vue'

/** The location the calendar is showing, owned by this level and read by the day leaf below it. */
export interface CalendarLocation {
  id: string
  status: string
  opening_hours: unknown
  special_hours: unknown
}
export const calendarLocationKey = Symbol('calendar-location') as InjectionKey<{
  location: Ref<CalendarLocation | null | undefined>
  refresh: () => Promise<void>
}>
</script>

<script setup lang="ts">
import { CalendarDate, getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date'
import { closureOnDate, getDateIntervals, parseOpeningHours, parseSpecialHours } from '~/shared/reservation-hours'
import { formatCalendarDate } from '~/utils/timezone'
import { getErrorMessage } from '~/utils/errors'
import type { AgendaItem, AgendaKind, AgendaLocation, AgendaPayload } from '~/server/utils/dashboard-agenda'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Calendar | Krabiclaw', robots: 'noindex, nofollow' })

const FILTER_ALL = '__all__'
const INITIAL_MONTHS = 3
const route = useRoute()
const router = useRouter()
const dashboardApi = useDashboardApi()
const routeKind = typeof route.query.kinds === 'string' && ['reservation', 'booking', 'session', 'post'].includes(route.query.kinds) ? route.query.kinds : FILTER_ALL
const routeLocationId = typeof route.query.locationId === 'string' ? route.query.locationId : FILTER_ALL
const filters = reactive({ locationId: routeLocationId, kind: routeKind })
const agendaError = ref<unknown>(null)

const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const timeZone = getLocalTimeZone()
const todayDate = today(timeZone)
const todayKey = todayDate.toString()

// Reka draws the outside-view days as cells; Airbnb leaves those blank, so
// they are made invisible rather than removed, which keeps the grid aligned.
const calendarUi = {
  header: 'hidden',
  gridWeekDaysRow: 'hidden',
  grid: 'w-full',
  gridBody: 'grid gap-1.5',
  gridRow: 'grid grid-cols-7 gap-1.5 place-items-stretch',
  cell: 'w-full p-0',
  cellTrigger: [
    'm-0 flex h-20 w-full flex-col items-center justify-start rounded-xl bg-elevated/70 pt-2 lg:h-24',
    'transition-colors hover:bg-elevated hover:not-data-selected:bg-elevated',
    'data-[outside-view]:invisible',
    'data-[selected]:bg-elevated/70 data-[selected]:text-highlighted data-[selected]:ring-2 data-[selected]:ring-primary data-[selected]:ring-inset',
    'data-[today]:text-highlighted',
    'data-[unavailable]:bg-elevated/30 data-[unavailable]:pointer-events-auto data-[unavailable]:no-underline',
  ].join(' '),
}

interface MonthBlock {
  key: string
  first: CalendarDate
  label: string
  status: 'loading' | 'ready' | 'error'
  items: AgendaItem[]
}

const monthKeys = ref<string[]>([])
const monthData = shallowRef(new Map<string, MonthBlock>())
const locations = ref<AgendaLocation[]>([])
// With one location chosen the tiles say which days it cannot take — its own
// closures and the weekdays its hours never open. Across every location there
// is no one answer, so nothing is struck.
const isLocationHours = (value: unknown): value is { location: CalendarLocation } =>
  isRecord(value) && isRecord(value.location) && typeof value.location.id === 'string' && typeof value.location.status === 'string'
const organizationId = await useDashboardOrganizationId()
const { data: chosenLocation, refresh: refreshLocation } = await useAsyncData(
  () => `calendar-location:${organizationId}:${filters.locationId}`,
  async () => filters.locationId === FILTER_ALL
    ? null
    : (await dashboardApi<{ location: CalendarLocation }>(`/api/organizations/${organizationId}/locations/${filters.locationId}`, { validate: isLocationHours })).location,
  { watch: [() => filters.locationId] },
)
provide(calendarLocationKey, { location: chosenLocation, refresh: async () => { await refreshLocation() } })
function isUnavailable(day: DateValue): boolean {
  const record = chosenLocation.value
  if (!record) return false
  if (record.status !== 'active') return true
  const key = day.toString()
  const special = parseSpecialHours(record.special_hours ?? null)
  if (closureOnDate(special, key)) return true
  const intervals = getDateIntervals(parseOpeningHours(record.opening_hours ?? null), special, key)
  return intervals !== null && intervals.length === 0
}
const availableKinds = ref<AgendaKind[]>([])
const generation = ref(0)

function putMonth(block: MonthBlock): void {
  monthData.value = new Map(monthData.value).set(block.key, block)
}
function monthKeyOf(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}`
}
function firstOf(key: string): CalendarDate {
  const [year, month] = key.split('-').map(Number)
  return new CalendarDate(year!, month!, 1)
}
function monthLabelOf(first: CalendarDate): string {
  // The year is said when it changes, which is how Airbnb heads January.
  return formatCalendarDate(first.toString(), 'en', first.year === todayDate.year && first.month !== 1 ? { month: 'long' } : { month: 'short', year: 'numeric' })
}

const months = computed(() => monthKeys.value.map(key => monthData.value.get(key)!).filter(Boolean))

const isAgendaItem = (value: unknown): value is AgendaItem =>
  isRecord(value) && typeof value.id === 'string' && typeof value.kind === 'string'
  && typeof value.startsAt === 'string' && typeof value.dayKey === 'string'
  && typeof value.timeZone === 'string' && typeof value.title === 'string'
  && typeof value.status === 'string' && typeof value.to === 'string'
const isLocation = (value: unknown): value is AgendaLocation => isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string'
const isAgendaPayload = (value: unknown): value is AgendaPayload =>
  isRecord(value) && Array.isArray(value.items) && value.items.every(isAgendaItem)
  && Array.isArray(value.availableKinds) && value.availableKinds.every(kind => ['reservation', 'booking', 'session', 'post'].includes(String(kind)))
  && Array.isArray(value.locations) && value.locations.every(isLocation)

async function loadMonth(key: string): Promise<void> {
  const first = firstOf(key)
  const last = first.add({ months: 1 }).subtract({ days: 1 })
  const requested = generation.value
  putMonth({ key, first, label: monthLabelOf(first), status: 'loading', items: [] })
  try {
    const payload = await dashboardApi<AgendaPayload>('/api/dashboard/agenda', {
      query: {
        from: first.toString(), to: last.toString(),
        locationId: filters.locationId !== FILTER_ALL ? filters.locationId : undefined,
        kinds: filters.kind !== FILTER_ALL ? filters.kind : undefined,
      },
      validate: isAgendaPayload,
    })
    if (requested !== generation.value) return
    locations.value = payload.locations
    availableKinds.value = payload.availableKinds
    putMonth({ key, first, label: monthLabelOf(first), status: 'ready', items: payload.items })
    agendaError.value = null
  } catch (error) {
    if (requested !== generation.value) return
    putMonth({ key, first, label: monthLabelOf(first), status: 'error', items: [] })
    agendaError.value = error
  }
}

async function resetMonths(): Promise<void> {
  generation.value += 1
  monthData.value = new Map()
  monthKeys.value = Array.from({ length: INITIAL_MONTHS }, (_, offset) => monthKeyOf(todayDate.add({ months: offset })))
  await Promise.all(monthKeys.value.map(loadMonth))
}

function loadNextMonth(): void {
  const lastKey = monthKeys.value.at(-1)
  if (!lastKey) return
  const next = monthKeyOf(firstOf(lastKey).add({ months: 1 }))
  monthKeys.value = [...monthKeys.value, next]
  void loadMonth(next)
}

const itemsByDay = computed(() => {
  const groups = new Map<string, AgendaItem[]>()
  for (const month of months.value) {
    for (const item of month.items) groups.set(item.dayKey, [...(groups.get(item.dayKey) ?? []), item])
  }
  return groups
})

function countFor(day: DateValue): number {
  return itemsByDay.value.get(day.toString())?.length ?? 0
}
function isToday(day: DateValue): boolean {
  return day.toString() === todayKey
}

// The open day is the route below this level, so a reload and a deep link ring
// the same tile, and Back from the leaf clears it.
const level = useRouteLevel()
const selectedDate = computed<CalendarDate | null>(() => typeof route.params.day === 'string' ? parseDate(route.params.day) : null)

function selectDay(value: unknown): void {
  const chosen = value instanceof CalendarDate ? value : value ? parseDate(String(value)) : null
  if (!chosen) return
  void navigateTo({ path: `${level.path.value}/${chosen.toString()}`, query: route.query })
}

const locationOptions = computed(() => [{ label: 'All locations', value: FILTER_ALL }, ...locations.value.map(location => ({ label: location.title, value: location.id }))])
const kindOptions = computed(() => [{ label: 'All kinds', value: FILTER_ALL }, ...availableKinds.value.map(kind => ({ label: kindLabel(kind), value: kind }))])
function kindLabel(kind: AgendaKind) {
  return ({ reservation: 'Reservation', booking: 'Booking', session: 'Session', post: 'Post' })[kind]
}

// The months keep scrolling: a sentinel below the last one asks for the next.
const sentinel = ref<HTMLElement | null>(null)
const monthElements = new Map<string, HTMLElement>()
const todayInView = ref(true)
let sentinelObserver: IntersectionObserver | null = null
let todayObserver: IntersectionObserver | null = null

function registerMonth(key: string, el: Element | ComponentPublicInstance | null): void {
  if (el instanceof HTMLElement) {
    monthElements.set(key, el)
    if (key === monthKeyOf(todayDate)) todayObserver?.observe(el)
  } else {
    monthElements.delete(key)
  }
}

function scrollToToday(): void {
  monthElements.get(monthKeyOf(todayDate))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(async () => {
  todayObserver = new IntersectionObserver(([entry]) => { todayInView.value = entry?.isIntersecting ?? true })
  sentinelObserver = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) loadNextMonth() })
  await resetMonths()
  await nextTick()
  if (sentinel.value) sentinelObserver.observe(sentinel.value)
})
onBeforeUnmount(() => {
  sentinelObserver?.disconnect()
  todayObserver?.disconnect()
})

watch(() => [filters.locationId, filters.kind], () => {
  void router.replace({
    query: {
      ...route.query,
      locationId: filters.locationId === FILTER_ALL ? undefined : filters.locationId,
      kinds: filters.kind === FILTER_ALL ? undefined : filters.kind,
    },
  })
  void resetMonths()
})
</script>
