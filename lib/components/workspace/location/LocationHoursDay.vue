<template>
  <!--
    One weekday: whether it opens, then its opening periods. A day with no
    periods is closed; Open is an answer the owner gives, not something read
    off an empty day, so a week that has never been answered shows its times.
  -->
  <div>
    <SettingRow :model-value="!closed" label="Open" @update:model-value="setOpen" />
    <div v-if="!closed" class="space-y-4 pt-6">
      <div v-for="period in periods" :key="period.index" class="flex items-end gap-3">
        <template v-if="!period.value.close">
          <p class="flex-1 py-3 text-base text-highlighted">Open 24 hours</p>
          <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" square aria-label="Remove open 24 hours" @click="removePeriod(period.index)" />
        </template>
        <template v-else>
          <UFormField label="Opens at" class="flex-1">
            <UInput :model-value="pointTime(period.value.open)" type="time" class="w-full" @update:model-value="setTime(period.value as EditablePeriod, 'open', String($event))" />
          </UFormField>
          <UFormField label="Closes at" class="flex-1">
            <UInput :model-value="pointTime(period.value.close)" type="time" class="w-full" @update:model-value="setTime(period.value as EditablePeriod, 'close', String($event))" />
          </UFormField>
          <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" square aria-label="Remove these hours" @click="removePeriod(period.index)" />
        </template>
      </div>
      <p v-if="overnight" class="text-sm text-muted">Closes after midnight, the following day.</p>
      <UButton v-if="!allDay" icon="i-lucide-plus" color="neutral" variant="soft" class="rounded-full" label="Add hours" @click="addPeriod" />
    </div>
  </div>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { toMinutes, toTimeString, type WeekPoint } from '~/shared/reservation-hours'
import type { LocationHoursForm } from './hours'

const form = defineModel<LocationHoursForm>('form', { required: true })
const props = defineProps<{ day: number }>()

type EditablePeriod = { open: WeekPoint; close: WeekPoint }

const periods = computed(() => (form.value.hours?.periods ?? [])
  .map((value, index) => ({ value, index }))
  .filter(entry => entry.value.open.day === props.day))
const allDay = computed(() => periods.value.some(period => !period.value.close))
const overnight = computed(() => periods.value.some(period => period.value.close && period.value.close.day !== period.value.open.day))

// Unanswered hours (null) read as open, so the owner fills in times rather
// than switching seven days on; answered hours with nothing today read closed.
const closed = ref(form.value.hours !== null && !periods.value.length)
// A new draft — loaded, saved and refreshed, or discarded — answers afresh.
// Edits change the same hours object, so they keep an open day with no times open.
watch(() => form.value.hours, (hours, previous) => {
  if (hours !== previous) closed.value = hours !== null && !periods.value.length
})

function ensureHours() {
  form.value.hours ??= { periods: [] }
  return form.value.hours
}

function setOpen(open: boolean) {
  closed.value = !open
  const hours = ensureHours()
  if (!open) hours.periods = hours.periods.filter(period => period.open.day !== props.day)
  else if (!periods.value.length) addPeriod()
}

function addPeriod() {
  const hours = ensureHours()
  const day = props.day
  const later = periods.value.length > 0
  hours.periods.push({ open: { day, hour: later ? 18 : 9, minute: 0 }, close: { day, hour: later ? 22 : 17, minute: 0 } })
}

function removePeriod(index: number) {
  form.value.hours?.periods.splice(index, 1)
  // An empty day saves as closed, so the switch has to say so.
  if (!periods.value.length) closed.value = true
}

const pointTime = (point: WeekPoint) => toTimeString(point.hour * 60 + point.minute)

// A bar that opens at 18:00 and closes at 01:00 closes on the next day. The
// owner should not have to say so: the stored close day follows the times.
function setTime(period: EditablePeriod, end: 'open' | 'close', value: string) {
  const minutes = toMinutes(value)
  period[end].hour = Math.floor(minutes / 60)
  period[end].minute = minutes % 60
  const opens = period.open.hour * 60 + period.open.minute
  const closes = period.close.hour * 60 + period.close.minute
  period.close.day = closes <= opens ? (period.open.day + 1) % 7 : period.open.day
}
</script>
