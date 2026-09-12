<template>
  <div class="space-y-6">
    <UFormField label="Timezone" required>
      <USelectMenu v-model="form.timezone" :items="TIMEZONE_OPTIONS" placeholder="Select timezone" :search-input="{ placeholder: 'Search by city, e.g. Bangkok' }" class="w-full">
        <template #default="{ modelValue }">{{ modelValue ? timezoneLabel(modelValue as string) : 'Select timezone' }}</template>
        <template #item-label="{ item }">{{ timezoneLabel(item as string) }}</template>
      </USelectMenu>
    </UFormField>

    <!-- One row per day: the day and whether it is closed on the left, its
         opening periods on the right. A day with no periods is closed; the
         whole week with no periods at all is "not answered yet", which is what
         "Continue without hours" saves. -->
    <div class="space-y-4">
      <p class="font-semibold">Regular opening hours</p>
      <div class="space-y-4">
        <div
          v-for="day in weekRows"
          :key="day.value"
          class="grid gap-3 border-b border-default pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start"
        >
          <div class="space-y-2">
            <p class="font-medium text-highlighted">{{ day.label }}</p>
            <UCheckbox
              :model-value="isClosed(day.value)"
              label="Closed"
              @update:model-value="setClosed(day.value, $event === true)"
            />
          </div>

          <div v-if="!isClosed(day.value)" class="space-y-2">
            <div
              v-for="period in periodsFor(day.value)"
              :key="period.index"
              class="flex items-end gap-2"
            >
              <template v-if="!period.value.close">
                <p class="flex-1 py-2 font-medium text-highlighted">Open 24 hours</p>
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  square
                  aria-label="Remove open 24 hours"
                  @click="removePeriod(period.index)"
                />
              </template>
              <template v-else>
              <UFormField label="Opens at" class="flex-1">
                <UInput
                  :model-value="pointTime(period.value.open)"
                  type="time"
                  class="w-full"
                  @update:model-value="setOpenTime(period.value as EditablePeriod, String($event))"
                />
              </UFormField>
              <UFormField label="Closes at" class="flex-1">
                <UInput
                  :model-value="pointTime(period.value.close!)"
                  type="time"
                  class="w-full"
                  @update:model-value="setCloseTime(period.value as EditablePeriod, String($event))"
                />
              </UFormField>
              <UButton
                v-if="period.first && !hasAllDay(day.value)"
                icon="i-lucide-plus"
                color="neutral"
                variant="ghost"
                square
                aria-label="Add another opening period"
                @click="addPeriod(day.value)"
              />
              <UButton
                v-else
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                square
                aria-label="Remove this opening period"
                @click="removePeriod(period.index)"
              />
              </template>
            </div>
            <UButton
              v-if="!periodsFor(day.value).length"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              label="Add hours"
              @click="addPeriod(day.value)"
            />
            <p v-if="overnight(day.value)" class="text-sm text-muted">Closes after midnight, the following day.</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="exceptions" class="space-y-4 border-t border-default pt-6">
      <p class="font-semibold">Closures and date exceptions</p>
      <div v-for="(entry, index) in form.specialHours" :key="index" class="space-y-3 rounded-xl border border-default p-4">
        <template v-if="entry.kind === 'closure'">
          <UFormField label="Closed from"><UInput v-model="entry.starts_on" type="date" /></UFormField>
          <UFormField label="Last closed date" help="Leave empty for an indefinite closure."><UInput :model-value="entry.ends_on ?? ''" type="date" @update:model-value="entry.ends_on = String($event) || null" /></UFormField>
        </template>
        <template v-else>
          <UFormField label="Date"><UInput v-model="entry.date" type="date" /></UFormField>
          <p class="text-sm text-muted">These hours replace regular hours for this date. No periods means closed.</p>
          <div v-for="(period, periodIndex) in entry.periods" :key="periodIndex" class="grid grid-cols-2 gap-3">
            <UFormField label="Open"><UInput v-model="period.open_time" type="time" /></UFormField>
            <UFormField label="Close"><UInput v-model="period.close_time" type="time" /></UFormField>
            <UCheckbox :model-value="period.close_day_offset === 1" label="Closes next day" @update:model-value="period.close_day_offset = $event === true ? 1 : 0" />
            <UButton color="neutral" variant="ghost" label="Remove period" @click="entry.periods.splice(periodIndex, 1)" />
          </div>
          <UButton color="neutral" variant="outline" label="Add period" @click="entry.periods.push({ open_time: '09:00', close_time: '17:00', close_day_offset: 0 })" />
        </template>
        <UFormField label="Guest message"><UInput :model-value="entry.note ?? ''" class="w-full" @update:model-value="entry.note = String($event) || null" /></UFormField>
        <UButton color="neutral" variant="ghost" label="Remove exception" @click="form.specialHours?.splice(index, 1)" />
      </div>
      <div class="flex gap-3">
        <UButton color="neutral" variant="outline" label="Add closure" @click="addException('closure')" />
        <UButton color="neutral" variant="outline" label="Add date hours" @click="addException('hours')" />
      </div>
    </div>
    <p v-if="validationError" class="text-sm text-error">{{ validationError }}</p>
    <UButton v-if="actionLabel" :label="form.hours === null ? 'Continue without hours' : actionLabel" :loading="loading" :disabled="disabled || Boolean(validationError)" block size="xl" @click="$emit('submit')" />
  </div>
</template>

<script setup lang="ts">
import { TIMEZONE_OPTIONS, localNow, timezoneLabel } from '~/utils/timezone'
import { WEEKDAYS, parseOpeningHours, parseSpecialHours, toTimeString, toMinutes, type OpeningHours, type SpecialHours, type WeekPoint } from '~/shared/reservation-hours'
export type LocationHoursForm = { timezone: string; hours: OpeningHours; specialHours: SpecialHours }
const form = defineModel<LocationHoursForm>('form', { required: true })
// Closures and one-off date hours are a running-a-business job, not a
// launch-your-site job: the dashboard's location settings own them, and asking
// a brand-new owner to think about next Songkran before their site exists was
// four concepts in one step.
const props = defineProps<{ actionLabel?: string; loading?: boolean; disabled?: boolean; exceptions?: boolean }>()
const exceptions = computed(() => props.exceptions === true)
defineEmits<{ submit: [] }>()
// Monday first, the way a week reads on a sign in a window. WEEKDAYS is indexed
// from Sunday because that is what the stored WeekPoint.day means.
const weekRowValues = [1, 2, 3, 4, 5, 6, 0]
const weekRows = weekRowValues.map(value => ({
  value,
  label: WEEKDAYS[value]![0]!.toUpperCase() + WEEKDAYS[value]!.slice(1),
}))

export type EditablePeriod = { open: WeekPoint; close: WeekPoint }

const periods = computed(() => form.value.hours?.periods ?? [])

// A period is a day's period when it opens on that day. `close` is optional in
// the stored shape (a period with no close is the open-24-hours marker), and
// the grid only edits periods that close.
function periodsFor(day: number) {
  return periods.value
    .map((value, index) => ({ value, index }))
    .filter(entry => entry.value.open.day === day)
    .map((entry, position) => ({
      ...entry,
      value: entry.value as { open: WeekPoint; close?: WeekPoint },
      first: position === 0,
    }))
}

// Closed is an answer the owner gives, not something inferred from an empty
// day. Inferring it meant the first day they filled in marked the other six
// closed and hid their fields — the opposite of what they said. A day with no
// periods still saves as closed; this only decides whether the row offers its
// times or reads as deliberately shut.
const closedDays = ref(new Set<number>(
  form.value.hours === null
    ? []
    : weekRowValues.filter(day => !form.value.hours!.periods.some(period => period.open.day === day)),
))

function isClosed(day: number) {
  return closedDays.value.has(day)
}

function ensureHours() {
  form.value.hours ??= { periods: [] }
  return form.value.hours
}

function setClosed(day: number, closed: boolean) {
  const next = new Set(closedDays.value)
  if (closed) {
    const hours = ensureHours()
    hours.periods = hours.periods.filter(period => period.open.day !== day)
    next.add(day)
  } else {
    next.delete(day)
    addPeriod(day)
  }
  closedDays.value = next
}

function addPeriod(day: number) {
  const hours = ensureHours()
  const previous = periodsFor(day).at(-1)?.value
  const open = previous ? { day, hour: 18, minute: 0 } : { day, hour: 9, minute: 0 }
  const close = previous ? { day, hour: 22, minute: 0 } : { day, hour: 17, minute: 0 }
  hours.periods.push({ open, close })
}

function removePeriod(index: number) {
  const hours = form.value.hours
  const day = hours?.periods[index]?.open.day
  hours?.periods.splice(index, 1)
  // An empty day saves as closed, so the checkbox has to say so. Leaving it
  // unchecked let an owner save a closed day while the row still read as open.
  if (day !== undefined && !hours?.periods.some(period => period.open.day === day)) {
    closedDays.value = new Set(closedDays.value).add(day)
  }
}

const pointTime = (point: WeekPoint) => toTimeString(point.hour * 60 + point.minute)

function applyTime(point: WeekPoint, value: string) {
  const minutes = toMinutes(value)
  point.hour = Math.floor(minutes / 60)
  point.minute = minutes % 60
}

function setOpenTime(period: EditablePeriod, value: string) {
  applyTime(period.open, value)
  syncCloseDay(period)
}

function setCloseTime(period: EditablePeriod, value: string) {
  applyTime(period.close, value)
  syncCloseDay(period)
}

// A bar that opens at 18:00 and closes at 01:00 closes on the next day. The
// owner should not have to say so: the stored close day follows the times.
function syncCloseDay(period: EditablePeriod) {
  const opens = period.open.hour * 60 + period.open.minute
  const closes = period.close.hour * 60 + period.close.minute
  period.close.day = closes <= opens ? (period.open.day + 1) % 7 : period.open.day
}

function overnight(day: number) {
  return periodsFor(day).some(period => period.value.close && period.value.close.day !== period.value.open.day)
}

/** A day already open around the clock; a second period would overlap it. */
function hasAllDay(day: number) {
  return periodsFor(day).some(period => !period.value.close)
}

function addException(kind: 'closure' | 'hours') {
  const date = form.value.timezone ? localNow(form.value.timezone).date : ''
  form.value.specialHours ??= []
  form.value.specialHours.push(kind === 'closure' ? { kind, starts_on: date, ends_on: null, note: null } : { kind, date, periods: [], note: null })
}
const validationError = computed(() => {
  try {
    if (!form.value.timezone) return 'Choose the location timezone.'
    parseOpeningHours(form.value.hours)
    parseSpecialHours(form.value.specialHours)
    return null
  } catch (error) { return error instanceof Error ? error.message : 'Invalid hours' }
})
</script>
