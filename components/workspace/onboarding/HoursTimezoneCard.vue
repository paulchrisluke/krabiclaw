<template>
  <div class="onboarding-intake-card">
      <UFormField label="Timezone" required>
        <USelectMenu
          v-model="form.timezone"
          class="w-full"
          size="xl"
          :items="timezoneOptions"
          placeholder="Select timezone"
        />
      </UFormField>

      <div class="space-y-2">
        <div
          v-for="(day, index) in form.hours"
          :key="day.day"
          class="@container grid gap-3 rounded-xl border border-default bg-elevated p-3"
        >
          <div class="flex min-h-9 items-center justify-between gap-3">
            <p class="text-[13px] font-bold text-highlighted">{{ day.day }}</p>
            <UCheckbox v-model="day.closed" label="Closed" class="shrink-0" />
          </div>
          <div class="grid gap-2 @sm:grid-cols-[1fr_1fr_auto]">
            <USelect
              v-model="day.open"
              class="w-full"
              size="lg"
              :items="timeOptions"
              value-key="value"
              label-key="label"
              :disabled="day.closed"
              aria-label="Open time"
            />
            <USelect
              v-model="day.close"
              class="w-full"
              size="lg"
              :items="timeOptions"
              value-key="value"
              label-key="label"
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

      <div class="grid gap-3">
        <UButton
          color="primary"
          size="xl"
          block
          class="justify-center"
          :loading="loading"
          :disabled="disabled || !canSubmit"
          @click="$emit('submit')"
        >
          {{ actionLabel }}
        </UButton>
      </div>
  </div>
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

<style scoped>
.onboarding-intake-card {
  display: grid;
  gap: 1rem;
}

.onboarding-intake-card :deep(.rounded-md),
.onboarding-intake-card :deep(.rounded-lg) {
  border-radius: 14px;
}

.onboarding-intake-card :deep(label) {
  color: var(--ui-text-muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}
</style>
