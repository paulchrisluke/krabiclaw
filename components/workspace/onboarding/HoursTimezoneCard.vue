<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-lucide-clock-3" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">{{ title }}</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ description }}</p>
        </div>
      </div>
    </template>

    <div class="space-y-4 px-4 pb-4">
      <UFormField label="Timezone" required>
        <USelectMenu
          v-model="form.timezone"
          :items="timezoneOptions"
          searchable
          placeholder="Select timezone"
        />
      </UFormField>

      <div class="space-y-2">
        <div
          v-for="(day, index) in form.hours"
          :key="day.day"
          class="grid gap-2 rounded-lg border border-default bg-default p-3 @container"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="text-[12px] font-semibold text-highlighted">{{ day.day }}</p>
            <UCheckbox v-model="day.closed" label="Closed" />
          </div>
          <div class="grid gap-2 @sm:grid-cols-[1fr_1fr_auto]">
            <USelect
              v-model="day.open"
              :items="timeOptions"
              value-attribute="value"
              label-attribute="label"
              :disabled="day.closed"
              aria-label="Open time"
            />
            <USelect
              v-model="day.close"
              :items="timeOptions"
              value-attribute="value"
              label-attribute="label"
              :disabled="day.closed"
              aria-label="Close time"
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="index === 0"
              @click="copyPrevious(index)"
            >
              Same as {{ previousDayLabel(index) }}
            </UButton>
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
        <p class="text-[11px] text-muted">Used for booking availability and guest-facing hours.</p>
        <UButton
          color="primary"
          class="justify-center"
          :loading="loading"
          :disabled="disabled || !canSubmit"
          @click="$emit('submit')"
        >
          {{ actionLabel }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { TIMEZONE_OPTIONS } from '~/utils/timezone'

export type WeekdayHours = {
  day: string
  open: string
  close: string
  closed: boolean
}

export type HoursTimezoneForm = {
  timezone: string
  hours: WeekdayHours[]
}

const form = defineModel<HoursTimezoneForm>('form', { required: true })

defineProps<{
  title: string
  description: string
  actionLabel: string
  loading?: boolean
  disabled?: boolean
}>()

defineEmits<{ submit: [] }>()

const timezoneOptions = TIMEZONE_OPTIONS
const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 === 0 ? '00' : '30'
  const value = `${String(hour).padStart(2, '0')}:${minute}`
  const hour12 = hour % 12 || 12
  const suffix = hour < 12 ? 'AM' : 'PM'
  return { label: `${hour12}:${minute} ${suffix}`, value }
})

const canSubmit = computed(() => {
  if (!form.value.timezone.trim()) return false
  return form.value.hours.every(day => day.closed || (day.open && day.close))
})

function previousDayLabel(index: number) {
  return index > 0 ? form.value.hours[index - 1]?.day ?? 'previous day' : 'previous day'
}

function copyPrevious(index: number) {
  const previous = form.value.hours[index - 1]
  const current = form.value.hours[index]
  if (!previous || !current) return
  current.open = previous.open
  current.close = previous.close
  current.closed = previous.closed
}
</script>
