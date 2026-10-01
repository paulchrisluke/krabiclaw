<template>
  <!-- Airbnb's Advance notice picker: one choice, applied to what guests are offered. -->
  <DashboardLeafPanel
    id="calendar-settings-notice"
    title="Advance notice"
    lead="How much notice do you need between a guest's booking and their arrival?"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <URadioGroup :model-value="chosen" :items="items" variant="card" class="w-full" @update:model-value="choose" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { NOTICE_OPTIONS } from '~/shared/availability-settings'
import { useCalendarLocationEditor } from '~/composables/useCalendarLocationEditor'

definePageMeta({ layout: 'dashboard' })

const editor = await useCalendarLocationEditor('reservations')
const items = NOTICE_OPTIONS.map(option => ({ value: String(option.value), label: option.label, description: 'description' in option ? option.description : undefined }))
const chosen = computed(() => String(editor.reservationForm.value.advance_notice_minutes ?? 0))
function choose(value: unknown) {
  const minutes = Number(value)
  editor.reservationForm.value = { ...editor.reservationForm.value, advance_notice_minutes: minutes === 0 ? null : minutes }
}
</script>
