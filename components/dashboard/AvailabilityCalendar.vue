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

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      title="Availability could not be loaded"
      :description="getErrorMessage(error, 'Availability request failed')"
    />
    <USkeleton v-else-if="pending || !calendar" class="h-80 w-full" />
    <UCard v-else-if="calendar.owners.length === 0" :ui="{ body: 'py-16 text-center' }">
      <p class="font-medium text-highlighted">No availability schedules at this location</p>
      <p class="mt-1 text-sm text-muted">Add an experience or configure reservation hours first.</p>
    </UCard>

    <div v-else class="overflow-x-auto rounded-lg border border-default" data-testid="availability-calendar">
      <div class="min-w-max">
        <div class="grid border-b border-default bg-muted/30" :style="gridStyle">
          <div class="sticky left-0 z-20 border-r border-default bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Schedule
          </div>
          <div v-for="date in dateKeys" :key="date" class="border-r border-default px-2 py-2 text-center last:border-r-0">
            <p class="text-[10px] font-medium uppercase text-muted">{{ weekdayLabel(date) }}</p>
            <p class="text-sm font-semibold text-highlighted">{{ dayNumber(date) }}</p>
          </div>
        </div>
        <div
          v-for="owner in calendar.owners"
          :key="ownerKey(owner)"
          class="grid border-b border-default last:border-b-0"
          :style="gridStyle"
        >
          <div class="sticky left-0 z-10 border-r border-default bg-default px-3 py-3">
            <p class="max-w-48 truncate text-sm font-medium text-highlighted">{{ owner.label }}</p>
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
          >
            <p class="text-xs font-medium">{{ dayState(day) }}</p>
            <p v-if="day.bookings.length" class="mt-1 text-[11px] text-violet-700 dark:text-violet-300">
              {{ day.bookings.length }} {{ day.bookings.length === 1 ? 'booking' : 'bookings' }}
            </p>
            <p v-if="dayNote(day)" class="mt-1 max-w-24 truncate text-[10px] text-muted" :title="dayNote(day) ?? undefined">
              {{ dayNote(day) }}
            </p>
          </button>
        </div>
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

const dashboardApi = useDashboardApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const resourceKey = computed(() => [
  'availability-calendar', props.siteId, props.locationId, props.from, props.to,
  props.ownerType ?? 'all', props.ownerId ?? 'all',
].join(':'))

function isCalendarResponse(value: unknown): value is { calendar: AvailabilityCalendar } {
  if (!isRecord(value) || !isRecord(value.calendar) || !Array.isArray(value.calendar.owners)) return false
  return value.calendar.owners.every(owner => isRecord(owner) && typeof owner.label === 'string' && Array.isArray(owner.days))
}

const { data, error, pending, refresh } = await useAsyncData(
  resourceKey,
  async () => await dashboardApi<{ calendar: AvailabilityCalendar }>(
    `/api/editor/sites/${props.siteId}/availability`,
    {
      query: {
        location_id: props.locationId,
        from: props.from,
        to: props.to,
        owner_type: props.ownerType,
        owner_id: props.ownerId,
      },
      validate: isCalendarResponse,
    },
  ),
  { server: false, watch: [resourceKey] },
)
const calendar = computed(() => data.value?.calendar ?? null)
const dateKeys = computed(() => calendar.value?.owners[0]?.days.map(day => day.date) ?? [])
const gridStyle = computed(() => ({ gridTemplateColumns: `13rem repeat(${dateKeys.value.length}, 7rem)` }))

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

const selectedOwner = computed(() => calendar.value?.owners.find(owner => ownerKey(owner) === selection.ownerKey) ?? null)
const selectedDates = computed(() => {
  if (!selection.anchor || !selection.focus) return []
  const start = selection.anchor < selection.focus ? selection.anchor : selection.focus
  const end = selection.anchor < selection.focus ? selection.focus : selection.anchor
  return dateKeys.value.filter(date => date >= start && date <= end)
})
const selectedDays = computed(() => selectedOwner.value?.days.filter(day => selectedDates.value.includes(day.date)) ?? [])
const selectedSlots = computed(() => selectedDays.value.flatMap(day => day.slots))
const selectionLabel = computed(() => {
  if (selectedDates.value.length === 0) return 'No dates selected'
  if (selectedDates.value.length === 1) return selectedDates.value[0]
  return `${selectedDates.value[0]} to ${selectedDates.value.at(-1)}`
})
const selectionSummary = computed(() => {
  const total = selectedSlots.value.length
  if (!total) return 'No scheduled slots in this selection'
  const blocked = selectedSlots.value.filter(slot => slot.is_closed).length
  const open = total - blocked
  return blocked > 0 && open > 0
    ? `Mixed availability — ${open} open, ${blocked} blocked`
    : blocked === total ? `${blocked} blocked` : `${open} open`
})
const fullSummary = computed(() => {
  const full = selectedSlots.value.filter(slot => slot.is_full).length
  return full ? `${full} ${full === 1 ? 'slot is' : 'slots are'} full from bookings.` : 'No selected slots are full from bookings.'
})

function beginSelection(owner: AvailabilityCalendarOwner, date: string) {
  dragging.value = true
  selection.ownerKey = ownerKey(owner)
  selection.anchor = date
  selection.focus = date
  saveError.value = null
}

function extendSelection(owner: AvailabilityCalendarOwner, date: string) {
  if (dragging.value && ownerKey(owner) === selection.ownerKey) selection.focus = date
}

function finishSelection() {
  if (!dragging.value) return
  dragging.value = false
  edit.timeSlots = ''
  edit.capacity = null
  edit.note = ''
  panelOpen.value = true
}

onMounted(() => window.addEventListener('pointerup', finishSelection))
onBeforeUnmount(() => window.removeEventListener('pointerup', finishSelection))

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

async function showAllOwners() {
  await router.replace({
    query: { ...route.query, ownerType: undefined, ownerId: undefined },
  })
}

function requestedTimes(day: AvailabilityCalendarDay): string[] {
  const explicit = edit.timeSlots.split(',').map(value => value.trim()).filter(Boolean)
  return [...new Set(explicit.length ? explicit : day.slots.map(slot => slot.time_slot))]
}

async function saveSelection() {
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
    await refresh()
    panelOpen.value = false
    toast.add({ description: 'Availability updated.', color: 'success' })
  } catch (cause) {
    saveError.value = getErrorMessage(cause, 'Availability update failed')
  } finally {
    saving.value = false
  }
}
</script>
