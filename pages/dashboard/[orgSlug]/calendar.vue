<template>
  <DashboardIndexPanel id="org-calendar" title="Calendar">
    <!-- Which location the calendar is: Airbnb names the listing in its header, and tapping it switches. -->
    <template #center>
      <UDropdownMenu :items="locationItems" :content="{ align: 'start' }" :ui="{ content: 'w-64' }">
        <UButton
          :label="chosenLocationTitle"
          trailing-icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          class="max-w-[16rem] font-semibold"
          :ui="{ label: 'truncate' }"
          aria-label="Choose a location"
        />
      </UDropdownMenu>
    </template>
    <template #right>
      <div class="flex items-center gap-1">
        <UButton
          v-if="chosenLocation && !selecting && view === 'month'"
          label="Select dates"
          color="neutral"
          variant="outline"
          size="sm"
          class="mr-1"
          @click="startSelecting"
        />
        <!-- List, Month, Year behind one icon, as Airbnb's view menu; what to show sits beneath them. -->
        <UDropdownMenu :items="viewItems" :content="{ align: 'end' }" :ui="{ content: 'w-44' }">
          <UButton :icon="VIEWS[view].icon" color="neutral" variant="ghost" size="sm" square :aria-label="`View: ${VIEWS[view].label}`" />
        </UDropdownMenu>
        <!-- The gear opens this location's reservation settings, as Airbnb's opens the listing's. -->
        <UButton
          v-if="chosenLocation"
          icon="i-lucide-settings"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          aria-label="Reservation settings"
          :to="{ path: `${level.path.value}/settings`, query: route.query }"
        />
      </div>
    </template>

    <div class="mx-auto w-full max-w-3xl pb-28">
      <!-- One weekday bar for every month below it, as Airbnb's calendar draws it. -->
      <div
        v-if="view === 'month'"
        class="sticky -top-4 z-10 -mx-4 -mt-4 grid grid-cols-7 border-b border-default bg-default px-4 pb-2 pt-6 text-center text-xs font-medium text-muted sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-8"
      >
        <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
      </div>

      <UAlert
        v-if="locationError"
        class="mt-6"
        color="error"
        variant="soft"
        title="The location could not be loaded"
        :description="getErrorMessage(locationError, 'Location request failed')"
      />

      <template v-if="view === 'month'">
        <section
          v-for="month in months"
          :key="month.key"
          :ref="(el) => registerMonth(month.key, el)"
          :data-month="month.key"
          class="pt-8"
        >
          <h2 class="mb-4 px-1 text-2xl font-semibold text-highlighted">{{ month.label }}</h2>

          <USkeleton v-if="month.status === 'loading'" class="h-80 w-full" />
          <UAlert
            v-else-if="month.status === 'error'"
            color="error"
            variant="soft"
            :title="`${month.label} could not be loaded`"
            :description="getErrorMessage(month.cause, 'Calendar request failed')"
            :actions="[{ label: 'Try again', color: 'neutral', variant: 'soft', onClick: () => loadMonth(month.key) }]"
          />

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
            @update:model-value="selectDay"
          >
            <template #day="{ day }">
              <span
                class="flex size-7 items-center justify-center rounded-full text-sm font-medium"
                :class="isToday(day) ? 'bg-primary text-inverted' : isUnavailable(day) ? 'text-muted line-through' : 'text-highlighted'"
                :data-closed="isUnavailable(day) ? '' : undefined"
                :data-in-range="inSelection(day) ? '' : undefined"
                :data-range-edge="isSelectionEdge(day) ? '' : undefined"
              >{{ day.day }}</span>
              <span v-if="countFor(day)" class="mt-1 text-xs tabular-nums text-muted">{{ countFor(day) }}</span>
            </template>
          </UCalendar>
        </section>
      </template>

      <!-- List: every day as a row under its month, Airbnb's agenda. -->
      <template v-else-if="view === 'list'">
        <section
          v-for="month in months"
          :key="month.key"
          :ref="(el) => registerMonth(month.key, el)"
          :data-month="month.key"
          class="pt-8"
        >
          <h2 class="mb-4 px-1 text-2xl font-semibold text-highlighted">{{ month.label }}</h2>
          <USkeleton v-if="month.status === 'loading'" class="h-80 w-full" />
          <UAlert
            v-else-if="month.status === 'error'"
            color="error"
            variant="soft"
            :title="`${month.label} could not be loaded`"
            :description="getErrorMessage(month.cause, 'Calendar request failed')"
            :actions="[{ label: 'Try again', color: 'neutral', variant: 'soft', onClick: () => loadMonth(month.key) }]"
          />
          <div v-else class="divide-y divide-default border-y border-default">
            <NuxtLink
              v-for="dayKey in daysOf(month)"
              :key="dayKey"
              :to="{ path: `${level.path.value}/${dayKey}`, query: route.query }"
              class="grid grid-cols-[3.5rem_1fr] gap-3 py-3 hover:bg-elevated/50"
              :data-day="dayKey"
            >
              <div class="pt-1 text-center">
                <span
                  class="mx-auto flex size-7 items-center justify-center rounded-full text-sm font-medium"
                  :class="dayKey === todayKey ? 'bg-primary text-inverted' : isUnavailableKey(dayKey) ? 'text-muted line-through' : 'text-highlighted'"
                >{{ Number(dayKey.slice(-2)) }}</span>
                <span class="block text-[11px] text-muted">{{ weekdayOf(dayKey) }}</span>
              </div>
              <div class="min-w-0">
                <template v-if="itemsByDay.get(dayKey)?.length">
                  <div v-for="item in itemsByDay.get(dayKey)" :key="item.id" class="grid grid-cols-[4rem_1fr] gap-2 py-1 text-sm">
                    <span class="tabular-nums text-highlighted">{{ timeOf(item) }}</span>
                    <span class="min-w-0"><span class="block truncate text-highlighted">{{ item.title }}</span><span class="block truncate text-xs text-muted">{{ item.subtitle }}</span></span>
                  </div>
                </template>
                <p v-else class="py-1 text-sm text-muted">{{ isUnavailableKey(dayKey) ? 'Unavailable' : 'Nothing scheduled' }}</p>
              </div>
            </NuxtLink>
          </div>
        </section>
      </template>

      <!-- Year: twelve small months, a dot where the day has something. -->
      <template v-else>
        <div class="flex items-center justify-between pt-6">
          <h2 class="text-2xl font-semibold text-highlighted">{{ shownYear }}</h2>
          <div class="flex gap-1">
            <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" square aria-label="Previous year" @click="showYear(shownYear - 1)" />
            <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" square aria-label="Next year" @click="showYear(shownYear + 1)" />
          </div>
        </div>
        <div class="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          <section v-for="month in months" :key="month.key" :data-month="month.key">
            <button type="button" class="mb-2 px-1 text-base font-semibold text-highlighted hover:text-primary" @click="openMonth(month.key)">
              {{ formatCalendarDate(month.first.toString(), 'en', { month: 'long' }) }}
            </button>
            <USkeleton v-if="month.status === 'loading'" class="h-40 w-full" />
            <UAlert
              v-else-if="month.status === 'error'"
              color="error"
              variant="soft"
              :description="getErrorMessage(month.cause, 'Calendar request failed')"
              :actions="[{ label: 'Try again', color: 'neutral', variant: 'soft', onClick: () => loadMonth(month.key) }]"
            />
            <UCalendar
              v-else
              :placeholder="month.first"
              :month-controls="false"
              :year-controls="false"
              :view-control="false"
              :fixed-weeks="false"
              :week-starts-on="0"
              :ui="yearUi"
              @update:model-value="openDay"
            >
              <template #day="{ day }">
                <span
                  class="text-[11px] leading-none"
                  :class="isToday(day) ? 'font-semibold text-primary' : isUnavailable(day) ? 'text-dimmed line-through' : 'text-highlighted'"
                >{{ day.day }}</span>
                <span class="mt-0.5 size-1 rounded-full" :class="countFor(day) ? 'bg-primary' : 'bg-transparent'" />
              </template>
            </UCalendar>
          </section>
        </div>
      </template>

      <div v-if="view !== 'year'" ref="sentinel" class="h-px" />
    </div>

    <template v-if="selecting" #footer>
      <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">{{ selectionLabel }}</p>
          <p class="text-xs text-muted">{{ selectionHint }}</p>
        </div>
        <div class="flex items-center gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="stopSelecting" />
          <UButton :label="selectionRange ? `Open ${selectionCountLabel}` : 'Open'" color="neutral" variant="soft" :disabled="!selectionRange" :loading="writing === 'open'" @click="writeSelection('open')" />
          <UButton :label="selectionRange ? `Block ${selectionCountLabel}` : 'Block'" :disabled="!selectionRange" :loading="writing === 'block'" @click="writeSelection('block')" />
        </div>
      </div>
    </template>

    <!-- Airbnb's floating Today: appears once today has scrolled away, and brings it back. -->
    <UButton
      v-if="!todayInView && !selecting && view !== 'year'"
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
import { closeDates, closureOnDate, getDateIntervals, openDates, parseOpeningHours, parseSpecialHours } from '~/shared/reservation-hours'
import { formatCalendarDate, formatTimestamp } from '~/utils/timezone'
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

const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const timeZone = getLocalTimeZone()
const todayDate = today(timeZone)
const todayKey = todayDate.toString()

// The three views of Airbnb's calendar; the URL carries which, so it survives a reload.
type CalendarView = 'list' | 'month' | 'year'
const VIEWS: Record<CalendarView, { label: string; icon: string }> = {
  list: { label: 'List', icon: 'i-lucide-list' },
  month: { label: 'Month', icon: 'i-lucide-layout-grid' },
  year: { label: 'Year', icon: 'i-lucide-grid-3x3' },
}
const view = ref<CalendarView>(route.query.view === 'list' || route.query.view === 'year' ? route.query.view : 'month')
const viewItems = computed(() => [
  (Object.keys(VIEWS) as CalendarView[]).map(key => ({
    label: VIEWS[key].label,
    icon: VIEWS[key].icon,
    type: 'checkbox' as const,
    checked: view.value === key,
    onSelect: () => { view.value = key },
  })),
  kindOptions.value.map(option => ({
    label: option.label,
    type: 'checkbox' as const,
    checked: filters.kind === option.value,
    onSelect: () => { filters.kind = option.value },
  })),
])
const locationItems = computed(() => [locationOptions.value.map(option => ({
  label: option.label,
  type: 'checkbox' as const,
  checked: filters.locationId === option.value,
  onSelect: () => { filters.locationId = option.value },
}))])
const chosenLocationTitle = computed(() => locations.value.find(location => location.id === filters.locationId)?.title ?? 'All locations')

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
    'has-[[data-closed]]:bg-elevated/30',
    'has-[[data-in-range]]:bg-primary/15 has-[[data-range-edge]]:bg-primary/25 has-[[data-range-edge]]:ring-2 has-[[data-range-edge]]:ring-primary has-[[data-range-edge]]:ring-inset',
  ].join(' '),
}
const yearUi = {
  header: 'hidden',
  grid: 'w-full',
  gridWeekDaysRow: 'grid grid-cols-7 mb-1',
  headCell: 'text-[10px] font-medium text-muted text-center',
  gridBody: 'grid gap-0.5',
  gridRow: 'grid grid-cols-7 gap-0.5 place-items-stretch',
  cell: 'w-full p-0',
  cellTrigger: 'm-0 flex h-7 w-full flex-col items-center justify-center rounded-md hover:bg-elevated data-[outside-view]:invisible data-[selected]:bg-transparent data-[today]:font-semibold',
}

type MonthBlock = { key: string; first: CalendarDate; label: string; items: AgendaItem[] } & (
  | { status: 'loading' | 'ready' }
  | { status: 'error'; cause: unknown }
)

const monthKeys = ref<string[]>([])
const monthData = shallowRef(new Map<string, MonthBlock>())
const locations = ref<AgendaLocation[]>([])
// With one location chosen the tiles say which days it cannot take — its own
// closures and the weekdays its hours never open. Across every location there
// is no one answer, so nothing is struck.
const isLocationHours = (value: unknown): value is { location: CalendarLocation } =>
  isRecord(value) && isRecord(value.location) && typeof value.location.id === 'string' && typeof value.location.status === 'string'
  && 'opening_hours' in value.location && 'special_hours' in value.location
const organizationId = await useDashboardOrganizationId()
const { data: chosenLocation, error: locationError, refresh: refreshLocation } = await useAsyncData(
  () => `calendar-location:${organizationId}:${filters.locationId}`,
  async () => filters.locationId === FILTER_ALL
    ? null
    : (await dashboardApi<{ location: CalendarLocation }>(`/api/organizations/${organizationId}/locations/${filters.locationId}`, { validate: isLocationHours })).location,
  { watch: [() => filters.locationId] },
)
provide(calendarLocationKey, { location: chosenLocation, refresh: async () => { await refreshLocation() } })
function isUnavailableKey(key: string): boolean {
  const record = chosenLocation.value
  if (!record) return false
  if (record.status !== 'active') return true
  const special = parseSpecialHours(record.special_hours)
  if (closureOnDate(special, key)) return true
  const intervals = getDateIntervals(parseOpeningHours(record.opening_hours), special, key)
  return intervals !== null && intervals.length === 0
}
function isUnavailable(day: DateValue): boolean {
  return isUnavailableKey(day.toString())
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

// Year shows twelve months of one year; the other views walk forward from today.
const shownYear = ref(todayDate.year)
const yearKeys = computed(() => Array.from({ length: 12 }, (_, index) => `${shownYear.value}-${String(index + 1).padStart(2, '0')}`))
const visibleKeys = computed(() => view.value === 'year' ? yearKeys.value : monthKeys.value)
const months = computed(() => visibleKeys.value.map(key => monthData.value.get(key)!).filter(Boolean))

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
  } catch (cause) {
    if (requested !== generation.value) return
    putMonth({ key, first, label: monthLabelOf(first), status: 'error', cause, items: [] })
  }
}

// A month that is there and not failed is left alone; a failed one is asked for again.
async function ensureLoaded(keys: string[]): Promise<void> {
  await Promise.all(keys.filter(key => monthData.value.get(key)?.status !== 'ready' && monthData.value.get(key)?.status !== 'loading').map(loadMonth))
}

async function resetMonths(): Promise<void> {
  generation.value += 1
  monthData.value = new Map()
  monthKeys.value = Array.from({ length: INITIAL_MONTHS }, (_, offset) => monthKeyOf(todayDate.add({ months: offset })))
  await ensureLoaded(view.value === 'year' ? yearKeys.value : monthKeys.value)
}

function loadNextMonth(): void {
  const lastKey = monthKeys.value.at(-1)
  if (!lastKey) return
  const next = monthKeyOf(firstOf(lastKey).add({ months: 1 }))
  monthKeys.value = [...monthKeys.value, next]
  void ensureLoaded([next])
}

function showYear(year: number): void {
  shownYear.value = year
  void ensureLoaded(yearKeys.value)
}

// A month chosen from the year opens the month view on it: the scroll starts
// there and walks forward, as it does from today.
async function openMonth(key: string): Promise<void> {
  monthKeys.value = Array.from({ length: INITIAL_MONTHS }, (_, offset) => monthKeyOf(firstOf(key).add({ months: offset })))
  view.value = 'month'
  await ensureLoaded(monthKeys.value)
  await nextTick()
  monthElements.get(key)?.scrollIntoView({ block: 'start' })
}
function openDay(value: unknown): void {
  const chosen = value instanceof CalendarDate ? value : value ? parseDate(String(value)) : null
  if (chosen) void openMonth(monthKeyOf(chosen))
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
function daysOf(month: MonthBlock): string[] {
  const count = month.first.add({ months: 1 }).subtract({ days: 1 }).day
  return Array.from({ length: count }, (_, index) => month.first.add({ days: index }).toString())
}
function weekdayOf(dayKey: string): string {
  return formatCalendarDate(dayKey, 'en', { weekday: 'short' })
}
function timeOf(item: AgendaItem): string {
  return formatTimestamp(item.startsAt, 'en', item.timeZone, { hour: 'numeric', minute: '2-digit' })
}

// The open day is the route below this level, so a reload and a deep link ring
// the same tile, and Back from the leaf clears it.
const level = useRouteLevel()
const selectedDate = computed<CalendarDate | null>(() => typeof route.params.day === 'string' ? parseDate(route.params.day) : null)

function selectDay(value: unknown): void {
  const chosen = value instanceof CalendarDate ? value : value ? parseDate(String(value)) : null
  if (!chosen) return
  if (selecting.value) {
    extendSelection(chosen.toString())
    return
  }
  void navigateTo({ path: `${level.path.value}/${chosen.toString()}`, query: route.query })
}

// Select dates — Airbnb's Select nights. A first tap starts the range, a
// second ends it (either order), a third starts over. Each month is its own
// UCalendar, so the range is kept here rather than in any one of them.
const selecting = ref(false)
const selection = reactive<{ start: string | null; end: string | null }>({ start: null, end: null })
const writing = ref<'block' | 'open' | null>(null)
const writeError = ref<unknown>(null)

function startSelecting(): void {
  selecting.value = true
  selection.start = null
  selection.end = null
  writeError.value = null
  if (typeof route.params.day === 'string') void navigateTo({ path: level.path.value, query: route.query })
}
function stopSelecting(): void {
  selecting.value = false
  selection.start = null
  selection.end = null
}
function extendSelection(day: string): void {
  if (!selection.start || selection.end) {
    selection.start = day
    selection.end = null
    return
  }
  if (day < selection.start) {
    selection.end = selection.start
    selection.start = day
  } else {
    selection.end = day
  }
}
const selectionRange = computed(() => selection.start ? { from: selection.start, to: selection.end ?? selection.start } : null)
const selectionDays = computed(() => {
  const range = selectionRange.value
  if (!range) return 0
  return parseDate(range.to).compare(parseDate(range.from)) + 1
})
const selectionCountLabel = computed(() => selectionDays.value === 1 ? '1 day' : `${selectionDays.value} days`)
const selectionLabel = computed(() => {
  const range = selectionRange.value
  if (!range) return 'Choose a start date'
  const from = formatCalendarDate(range.from, 'en', { month: 'short', day: 'numeric' })
  if (!selection.end) return `${from} — choose an end date, or block this day`
  return `${from} – ${formatCalendarDate(range.to, 'en', { month: 'short', day: 'numeric' })}`
})
const selectionHint = computed(() => writeError.value
  ? getErrorMessage(writeError.value, 'The dates were not saved')
  : selectionRange.value ? `${selectionCountLabel.value} selected` : 'Tap a day to start')

function inSelection(day: DateValue): boolean {
  const range = selectionRange.value
  if (!range) return false
  const key = day.toString()
  return key >= range.from && key <= range.to
}
function isSelectionEdge(day: DateValue): boolean {
  const range = selectionRange.value
  if (!range) return false
  const key = day.toString()
  return key === range.from || key === range.to
}

async function writeSelection(action: 'block' | 'open'): Promise<void> {
  const record = chosenLocation.value
  const range = selectionRange.value
  if (!record || !range) return
  const special = parseSpecialHours(record.special_hours)
  writing.value = action
  writeError.value = null
  try {
    await dashboardApi(`/api/organizations/${organizationId}/locations/${record.id}`, {
      method: 'PATCH',
      body: { special_hours: action === 'block' ? closeDates(special, range.from, range.to) : openDates(special, range.from, range.to) },
      validate: isLocationHours,
    })
    await refreshLocation()
    stopSelecting()
  } catch (cause) {
    writeError.value = cause
  } finally {
    writing.value = null
  }
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
  // The sentinel is already mounted by now, and comes and goes with the view
  // after; both are observed, or the first month after the third never loads.
  if (sentinel.value) sentinelObserver.observe(sentinel.value)
  await resetMonths()
})
watch(sentinel, (el, previous) => {
  if (previous) sentinelObserver?.unobserve(previous)
  if (el) sentinelObserver?.observe(el)
})
onBeforeUnmount(() => {
  sentinelObserver?.disconnect()
  todayObserver?.disconnect()
})

watch(view, (next) => {
  if (selecting.value) stopSelecting()
  void router.replace({ query: { ...route.query, view: next === 'month' ? undefined : next } })
  void ensureLoaded(next === 'year' ? yearKeys.value : monthKeys.value)
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
