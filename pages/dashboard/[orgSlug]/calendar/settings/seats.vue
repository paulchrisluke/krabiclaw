<template>
  <!-- Seats at one start time: the reservation's capacity, the way a class has places. -->
  <DashboardLeafPanel
    id="calendar-settings-seats"
    title="Seats per time slot"
    lead="How many guests can start at the same time? Once a time slot is full, guests are offered the next one."
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <SettingRow :model-value="limited" label="Limit seats" @update:model-value="setLimited">
      <UInputNumber v-if="limited" :model-value="editor.reservationForm.value.slot_capacity ?? 20" :min="1" aria-label="Seats" class="w-36" @update:model-value="setSeats" />
    </SettingRow>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { useCalendarLocationEditor } from '~/composables/useCalendarLocationEditor'

definePageMeta({ layout: 'dashboard' })

const editor = await useCalendarLocationEditor('reservations')
const limited = computed(() => editor.reservationForm.value.slot_capacity !== null && editor.reservationForm.value.slot_capacity !== undefined)
function setLimited(on: boolean) {
  editor.reservationForm.value = { ...editor.reservationForm.value, slot_capacity: on ? (editor.reservationForm.value.slot_capacity ?? 20) : null }
}
function setSeats(value: number | null) {
  editor.reservationForm.value = { ...editor.reservationForm.value, slot_capacity: value === null ? null : Math.max(1, Math.round(value)) }
}
</script>
