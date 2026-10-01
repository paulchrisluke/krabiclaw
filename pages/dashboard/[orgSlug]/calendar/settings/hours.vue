<template>
  <!-- The weekly hours reservation slots are generated from; the location's Hours leaf edits the same field. -->
  <DashboardLeafPanel
    id="calendar-settings-hours"
    title="Hours"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <LocationHoursCard v-model:form="editor.hoursForm.value" />
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import LocationHoursCard from '~/lib/components/workspace/location/LocationHoursCard.vue'
import { useCalendarLocationEditor } from '~/composables/useCalendarLocationEditor'

definePageMeta({ layout: 'dashboard' })

const editor = await useCalendarLocationEditor('hours')
</script>
