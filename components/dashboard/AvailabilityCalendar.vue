<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="font-semibold text-highlighted">Availability</h3>
        <p class="text-sm text-muted">Drag across dates to update availability, capacity, or a private note.</p>
      </div>
      <UButton
        v-if="ownerType && ownerId"
        color="neutral"
        variant="soft"
        icon="i-lucide-layout-grid"
        label="All availability"
        @click="showAllOwners"
      />
    </div>

    <USkeleton v-if="monthBlocks.length === 0" class="h-80 w-full" />

    <div v-else class="space-y-8">
      <section
        v-for="month in monthBlocks"
        :key="month.key"
        class="space-y-3"
        :aria-labelledby="`availability-month-${month.key}`"
        :data-testid="`availability-month-${month.key}`"
      >
        <h4 :id="`availability-month-${month.key}`" class="text-base font-semibold text-highlighted">
          {{ monthLabel(month.key) }}
        </h4>

        <USkeleton v-if="month.kind === 'loading'" class="h-64 w-full" />

        <div v-else-if="month.kind === 'error'" class="space-y-3">
          <UAlert
            color="error"
            variant="soft"
            title="Availability could not be loaded"
            :description="getErrorMessage(month.cause, 'Availability request failed')"
          />
          <UButton color="neutral" variant="soft" label="Retry month" @click="retryMonth(month.key)" />
        </div>

        <UCard v-else-if="month.calendar.owners.length === 0" :ui="{ body: 'py-12 text-center' }">
          <p class="font-medium text-highlighted">No availability schedules at this location</p>
          <p class="mt-1 text-sm text-muted">Add an experience or configure reservation hours first.</p>
        </UCard>

        <div v-else class="overflow-x-auto rounded-lg border border-default" data-testid="availability-calendar">
          <div class="min-w-max">
            <div class="grid border-b border-default bg-muted/30" :style="gridStyle(month.calendar)">
              <div class="sticky left-0 z-20 border-r border-default bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Schedule
              </div>
              <div v-for="date in dateKeys(month.calendar)" :key="date" class="border-r border-default px-2 py-2 text-center last:border-r-0">
                <p class="text-[10px] font-medium uppercase text-muted">{{ weekdayLabel(date) }}</p>
                <p class="text-sm font-semibold text-highlighted">{{ dayNumber(date) }}</p>
              </div>
            </div>
            <div
              v-for="owner in month.calendar.owners"
              :key="ownerKey(owner)"
              class="grid border-b border-default last:border-b-0"
              :style="gridStyle(month.calendar)"
            >
              <div class="sticky left-0 z-10 border-r border-default bg-default px-3 py-3">
                <button
                  v-if="!ownerType || !ownerId"
                  type="button"
                  class="block max-w-48 truncate text-left text-sm font-medium text-highlighted hover:text-primary"
                  :title="owner.label"
                  :aria-label="`Open ${owner.label} availability`"
                  @click="showOwner(owner)"
                >
                  {{ owner.label }}
                </button>
                <p v-else class="max-w-48 truncate text-sm font-medium text-highlighted" :title="owner.label">{{ owner.label }}</p>
                <p class="mt-0.5 text-xs text-muted">{{ owner.owner.kind === 'location' ? 'Reservations' : 'Experience' }}</p>
              </div>
              <button
                v-for="day in owner.days"
                :key="day.date"
                type="button"
                class="min-h-20 select-none border-r border-default px-2 py-2 text-left last:border-r-0"
                :class="cellClass(owner, day)"
                :aria-label="`${owner.label}, ${day.date}, ${dayState(day)}`"
                @pointerdown.prevent="beginSelection(owner, day.date)"
                @pointerenter="extendSelection(owner, day.date)"
                @keydown.enter.prevent="beginSelection(owner, day.date); finishSelection()"
                @keydown.space.prevent="beginSelection(owner, day.date); finishSelection()"
              >
                <p class="text-xs font-medium">{{ dayState(day) }}</p>
                <p
                  v-for="booking in day.bookings"
                  :key="booking.id"
                  class="mt-1 rounded bg-violet-500/15 px-1 py-0.5 text-[11px] text-violet-700 dark:text-violet-300"
                >
                  {{ booking.time_slot }} · {{ booking.label }} · {{ booking.party_size }} {{ booking.party_size === 1 ? 'guest' : 'guests' }}
                </p>
                <p v-if="dayNote(day)" class="mt-1 max-w-24 truncate text-[10px] text-muted" :title="dayNote(day) ?? undefined">
                  {{ dayNote(day) }}
                </p>
              </button>
            </div>
          </div>
        </div>
      </section>

      <div class="flex justify-center border-t border-default pt-4">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-calendar-plus"
          :label="`Load ${monthLabel(nextMonthKey)}`"
          :aria-label="`Load next month, ${monthLabel(nextMonthKey)}`"
          :loading="loadingNextMonth"
          :disabled="loadingNextMonth"
          data-testid="availability-load-next-month"
          @click="loadNextMonth"
        />
      </div>
    </div>

    <USlideover v-model:open="panelOpen" title="Edit availability" side="right">
      <template #body>
        <div class="space-y-5 p-6">
          <div>
            <p class="font-medium text-highlighted">{{ selectedOwner?.label }}</p>
            <p class="text-sm text-muted">{{ selectionLabel }}</p>
          </div>
          <UAlert
            v-if="selectionSummary"
            color="neutral"
            variant="soft"
            :title="selectionSummary"
            :description="fullSummary"
          />
          <UFormField label="Availability">
            <USelect v-model="edit.directive" :items="directiveOptions" class="w-full" />
          </UFormField>
          <UFormField label="Time slots" help="Comma-separated times. Leave empty to update every slot shown on the selected dates.">
            <UInput v-model="edit.timeSlots" placeholder="14:00, 18:00" class="w-full" />
          </UFormField>
          <UFormField v-if="edit.directive !== 'inherit'" label="Capacity override" help="Leave empty to use the schedule's default capacity.">
            <UInputNumber v-model="edit.capacity" :min="0" class="w-full" />
          </UFormField>
          <UFormField v-if="edit.directive !== 'inherit'" label="Private note" help="Visible only to tenant members.">
            <UTextarea v-model="edit.note" :rows="3" placeholder="Blocked for a private event" class="w-full" />
          </UFormField>
          <UAlert v-if="saveError" color="error" variant="soft" title="Availability was not saved" :description="saveError" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 px-6 py-4">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="panelOpen = false" />
          <UButton :loading="saving" label="Save changes" @click="saveSelection" />
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type {
  AvailabilityCalendar,
  AvailabilityCalendarDay,
  AvailabilityCalendarOwner,
  AvailabilityChange,
} from '~/server/utils/availability'
import { getErrorMessage } from '~/utils/errors'

const props = defineProps<{
  siteId: string
  locationId: string
  from: string
  to: string
  ownerType?: 'location' | 'experience'
  ownerId?: string
}>()

type MonthBlock =
  | { kind: 'loading'; key: string }
  | { kind: 'ready'; key: string; calendar: AvailabilityCalendar }
  | { kind: 'error'; key: string; cause: unknown }

const dashboardApi = useDashboardApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const monthBlocks = ref<MonthBlock[]>([])
const requestGeneration = ref(0)
const mounted = ref(false)
const nextMonthRequest = ref<{ key: string; generation: number } | null>(null)

const scopeKey = computed(() => [
  props.siteId,
  props.locationId,
  props.from,
  props.to,
  props.ownerType ?? 'all',
  props.ownerId ?? 'all',
].join(':'))
const startMonthKey = computed(() => props.from.slice(0, 7))
const displayedDateKeys = computed(() => [...new Set(monthBlocks.value.flatMap(month =>
  month.kind === 'ready' ? dateKeys(month.calendar) : [],
))].sort())
const nextMonthKey = computed(() => nextMonthRequest.value?.key
  ?? shiftMonth(monthBlocks.value.at(-1)?.key ?? startMonthKey.value, 1))
const loadingNextMonth = computed(() => nextMonthRequest.value !== null)

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isAvailabilityOwner(value: unknown): value is AvailabilityCalendarOwner {
  if (!isRecord(value) || !isRecord(value.owner)) return false
  const ownerIsValid = value.owner.kind === 'location'
    ? typeof value.owner.locationId === 'string'
    : value.owner.kind === 'experience' && typeof value.owner.experienceId === 'string'
  if (!ownerIsValid || typeof value.label !== 'string' || typeof value.location_id !== 'string'
    || typeof value.timezone !== 'string' || !Array.isArray(value.days)) return false
  return value.days.every(day => isRecord(day)
    && typeof day.date === 'string'
    && Array.isArray(day.slots)
    && day.slots.every(slot => isRecord(slot)
      && typeof slot.time_slot === 'string'
      && isNullableNumber(slot.capacity)
      && typeof slot.booked === 'number'
      && isNullableNumber(slot.remaining)
      && typeof slot.is_closed === 'boolean'
      && typeof slot.is_full === 'boolean'
      && (slot.override === null || (isRecord(slot.override)
        && typeof slot.override.id === 'string'
        && (slot.override.status === 'open' || slot.override.status === 'closed')
        && isNullableNumber(slot.override.capacity_override)
        && isNullableString(slot.override.note)
        && typeof slot.override.updated_at === 'string')))
    && Array.isArray(day.bookings)
    && day.bookings.every(booking => isRecord(booking)
      && typeof booking.id === 'string'
      && typeof booking.time_slot === 'string'
      && typeof booking.party_size === 'number'
      && typeof booking.label === 'string'
      && typeof booking.status === 'string'))
}

function isCalendarResponse(value: unknown): value is { calendar: AvailabilityCalendar } {
  return isRecord(value)
    && isRecord(value.calendar)
    && typeof value.calendar.from === 'string'
    && typeof value.calendar.to === 'string'
    && Array.isArray(value.calendar.owners)
    && value.calendar.owners.every(isAvailabilityOwner)
}

function monthBounds(key: string): { from: string; to: string } {
  const first = new Date(`${key}-01T00:00:00.000Z`)
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
  return { from: `${key}-01`, to: last.toISOString().slice(0, 10) }
}

function shiftMonth(key: string, offset: number): string {
  const date = new Date(`${key}-01T00:00:00.000Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 7)
}

function replaceMonth(block: MonthBlock): void {
  const existing = monthBlocks.value.findIndex(month => month.key === block.key)
  if (existing === -1) {
    monthBlocks.value = [...monthBlocks.value, block].sort((left, right) => left.key.localeCompare(right.key))
    return
  }
  monthBlocks.value = monthBlocks.value.map((month, index) => index === existing ? block : month)
}

async function loadMonth(key: string, generation = requestGeneration.value): Promise<void> {
  replaceMonth({ kind: 'loading', key })
  const range = monthBounds(key)
  try {
    const response = await dashboardApi<{ calendar: AvailabilityCalendar }>(
      `/api/editor/sites/${props.siteId}/availability`,
      {
        query: {
          location_id: props.locationId,
          from: range.from,
          to: range.to,
          owner_type: props.ownerType,
          owner_id: props.ownerId,
        },
        validate: isCalendarResponse,
      },
    )
    if (generation !== requestGeneration.value) return
    replaceMonth({ kind: 'ready', key, calendar: response.calendar })
  } catch (cause) {
    if (generation !== requestGeneration.value) return
    replaceMonth({ kind: 'error', key, cause })
  }
}

async function resetMonths(): Promise<void> {
  requestGeneration.value += 1
  const generation = requestGeneration.value
  monthBlocks.value = []
  nextMonthRequest.value = null
  dragging.value = false
  selection.ownerKey = ''
  selection.anchor = ''
  selection.focus = ''
  panelOpen.value = false
  await loadMonth(startMonthKey.value, generation)
}

function retryMonth(key: string): void {
  void loadMonth(key)
}

async function loadNextMonth(): Promise<void> {
  if (nextMonthRequest.value) return
  const request = { key: nextMonthKey.value, generation: requestGeneration.value }
  nextMonthRequest.value = request
  await loadMonth(request.key, request.generation)
  if (nextMonthRequest.value?.key === request.key && nextMonthRequest.value.generation === request.generation) {
    nextMonthRequest.value = null
  }
}

function dateKeys(calendar: AvailabilityCalendar): string[] {
  return calendar.owners[0]?.days.map(day => day.date) ?? []
}

function gridStyle(calendar: AvailabilityCalendar): { gridTemplateColumns: string } {
  return { gridTemplateColumns: `13rem repeat(${dateKeys(calendar).length}, 7rem)` }
}

function monthLabel(key: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(`${key}-01T00:00:00.000Z`))
}

const dragging = ref(false)
const selection = reactive({ ownerKey: '', anchor: '', focus: '' })
const panelOpen = ref(false)
const saving = ref(false)
const saveError = ref<string | null>(null)
const edit = reactive({
  directive: 'closed' as 'open' | 'closed' | 'inherit',
  timeSlots: '',
  capacity: null as number | null,
  note: '',
})

const directiveOptions = [
  { label: 'Blocked by you', value: 'closed' },
  { label: 'Open', value: 'open' },
  { label: 'Use recurring schedule', value: 'inherit' },
]

function ownerKey(owner: AvailabilityCalendarOwner): string {
  return owner.owner.kind === 'location'
    ? `location:${owner.owner.locationId}`
    : `experience:${owner.owner.experienceId}`
}

const selectedOwner = computed(() => {
  for (const month of monthBlocks.value) {
    if (month.kind !== 'ready') continue
    const owner = month.calendar.owners.find(item => ownerKey(item) === selection.ownerKey)
    if (owner) return owner
  }
  return null
})
const selectedDates = computed(() => {
  if (!selection.anchor || !selection.focus) return []
  const start = selection.anchor < selection.focus ? selection.anchor : selection.focus
  const end = selection.anchor < selection.focus ? selection.focus : selection.anchor
  return displayedDateKeys.value.filter(date => date >= start && date <= end)
})
const selectedDays = computed(() => monthBlocks.value.flatMap(month => {
  if (month.kind !== 'ready') return []
  const owner = month.calendar.owners.find(item => ownerKey(item) === selection.ownerKey)
  return owner?.days.filter(day => selectedDates.value.includes(day.date)) ?? []
}))
const selectedSlots = computed(() => selectedDays.value.flatMap(day => day.slots))
const selectionLabel = computed(() => {
  if (selectedDates.value.length === 0) return 'No dates selected'
  if (selectedDates.value.length === 1) return selectedDates.value[0]
  return `${selectedDates.value[0]} to ${selectedDates.value.at(-1)}`
})
const selectionSummary = computed(() => {
  const days = selectedDays.value.filter(day => day.slots.length > 0)
  if (!days.length) return 'No scheduled slots in this selection'
  const blocked = days.filter(day => day.slots.every(slot => slot.is_closed)).length
  const mixed = days.filter(day => day.slots.some(slot => slot.is_closed) && day.slots.some(slot => !slot.is_closed)).length
  const open = days.length - blocked - mixed
  if (!open && !mixed) return `${blocked} blocked ${blocked === 1 ? 'day' : 'days'}`
  if (!blocked && !mixed) return `${open} open ${open === 1 ? 'day' : 'days'}`
  return `Mixed availability: ${open} open days, ${blocked} blocked days${mixed ? `, ${mixed} partly blocked days` : ''}`
})
const fullSummary = computed(() => {
  const full = selectedSlots.value.filter(slot => slot.is_full).length
  return full ? `${full} ${full === 1 ? 'slot is' : 'slots are'} full from bookings.` : 'No selected slots are full from bookings.'
})

function beginSelection(owner: AvailabilityCalendarOwner, date: string): void {
  dragging.value = true
  selection.ownerKey = ownerKey(owner)
  selection.anchor = date
  selection.focus = date
  saveError.value = null
}

function extendSelection(owner: AvailabilityCalendarOwner, date: string): void {
  if (dragging.value && ownerKey(owner) === selection.ownerKey) selection.focus = date
}

function finishSelection(): void {
  if (!dragging.value) return
  dragging.value = false
  edit.timeSlots = ''
  const first = selectedSlots.value[0]
  edit.directive = first?.is_closed ? 'closed' : 'open'
  edit.capacity = selectedSlots.value.every(slot => slot.override?.capacity_override === first?.override?.capacity_override)
    ? first?.override?.capacity_override ?? null : null
  edit.note = selectedSlots.value.every(slot => slot.override?.note === first?.override?.note)
    ? first?.override?.note ?? '' : ''
  panelOpen.value = true
}

onMounted(() => {
  mounted.value = true
  window.addEventListener('pointerup', finishSelection)
  void resetMonths()
})
onBeforeUnmount(() => window.removeEventListener('pointerup', finishSelection))
watch(scopeKey, () => {
  if (mounted.value) void resetMonths()
})

function dayState(day: AvailabilityCalendarDay): string {
  if (day.slots.length === 0) return day.bookings.length ? 'Booked' : 'No slots'
  const blocked = day.slots.filter(slot => slot.is_closed).length
  if (blocked === day.slots.length) return 'Blocked'
  if (blocked > 0) return 'Mixed'
  if (day.slots.every(slot => slot.is_full)) return 'Full'
  return 'Available'
}

function dayNote(day: AvailabilityCalendarDay): string | null {
  return day.slots.find(slot => slot.override?.note)?.override?.note ?? null
}

function cellClass(owner: AvailabilityCalendarOwner, day: AvailabilityCalendarDay): string[] {
  const state = dayState(day)
  return [
    selectedDates.value.includes(day.date) && ownerKey(owner) === selection.ownerKey ? 'ring-2 ring-inset ring-primary' : '',
    state === 'Blocked' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : '',
    state === 'Full' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : '',
    state === 'Mixed' ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300' : '',
    state === 'Available' ? 'bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'text-muted',
  ]
}

function weekdayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${date}T00:00:00.000Z`))
}

function dayNumber(date: string): string {
  return String(Number(date.slice(-2)))
}

async function showAllOwners(): Promise<void> {
  await router.replace({
    query: { ...route.query, ownerType: undefined, ownerId: undefined },
  })
}

async function showOwner(owner: AvailabilityCalendarOwner): Promise<void> {
  const ownerType = owner.owner.kind
  const ownerId = owner.owner.kind === 'location' ? owner.owner.locationId : owner.owner.experienceId
  await router.replace({ query: { ...route.query, ownerType, ownerId } })
}

function requestedTimes(day: AvailabilityCalendarDay): string[] {
  const explicit = edit.timeSlots.split(',').map(value => value.trim()).filter(Boolean)
  return [...new Set(explicit.length ? explicit : day.slots.map(slot => slot.time_slot))]
}

async function saveSelection(): Promise<void> {
  if (!selectedOwner.value || selectedDays.value.length === 0) return
  const changes: AvailabilityChange[] = selectedDays.value.flatMap(day => requestedTimes(day).map((time_slot) => {
    const base = { override_date: day.date, time_slot }
    return edit.directive === 'inherit'
      ? { ...base, directive: 'inherit' as const }
      : {
          ...base,
          directive: 'set' as const,
          status: edit.directive,
          capacity_override: edit.capacity,
          note: edit.note,
        }
  }))
  if (changes.length === 0) {
    saveError.value = 'Enter a time slot when the selected dates have no scheduled slots.'
    return
  }
  saving.value = true
  saveError.value = null
  try {
    await dashboardApi(`/api/editor/sites/${props.siteId}/availability`, {
      method: 'PUT',
      body: { owner: selectedOwner.value.owner, changes },
      validate: (value): value is { overrides: unknown[] } => isRecord(value) && Array.isArray(value.overrides),
    })
    const changedMonths = [...new Set(changes.map(change => change.override_date.slice(0, 7)))]
    await Promise.all(changedMonths.map(key => loadMonth(key)))
    panelOpen.value = false
    toast.add({ description: 'Availability updated.', color: 'success' })
  } catch (cause) {
    saveError.value = getErrorMessage(cause, 'Availability update failed')
  } finally {
    saving.value = false
  }
}
</script>
