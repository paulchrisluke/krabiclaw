<template>
  <!--
    Onboarding's hours step: the timezone and the week in one screen, because
    a new owner answers it once. The dashboard edits the same values as an
    index — a row per day, each its own leaf — through the same day editor.
    The whole week with no periods at all is "not answered yet", which is what
    "Continue without hours" saves.
  -->
  <div class="space-y-6">
    <LocationTimezoneField v-model="form.timezone" />
    <section v-for="day in WEEK_ROWS" :key="day.value" class="border-b border-default pb-6 last:border-b-0">
      <h3 class="text-base font-semibold text-highlighted">{{ day.label }}</h3>
      <LocationHoursDay v-model:form="form" :day="day.value" />
    </section>
    <p v-if="validationError" class="text-sm text-error">{{ validationError }}</p>
    <UButton v-if="actionLabel" :label="form.hours === null ? 'Continue without hours' : actionLabel" :loading="loading" :disabled="disabled || Boolean(validationError)" block size="xl" @click="$emit('submit')" />
  </div>
</template>

<script setup lang="ts">
import { parseOpeningHours } from '~/shared/reservation-hours'
import LocationHoursDay from './LocationHoursDay.vue'
import LocationTimezoneField from './LocationTimezoneField.vue'
import { WEEK_ROWS, type LocationHoursForm } from './hours'

const form = defineModel<LocationHoursForm>('form', { required: true })
defineProps<{ actionLabel?: string; loading?: boolean; disabled?: boolean }>()
defineEmits<{ submit: [] }>()

const validationError = computed(() => {
  if (!form.value.timezone) return 'Choose the location timezone.'
  try {
    parseOpeningHours(form.value.hours)
    return null
  } catch (error) { return error instanceof Error ? error.message : 'Invalid hours' }
})
</script>
