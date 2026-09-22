<template>
  <DashboardLeafPanel
    id="location-status"
    title="Status"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UCheckbox :model-value="editor.detailsForm.status === 'active'" label="Active" @update:model-value="editor.setDetailsActive" />
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { useLocationEditor } from '~/lib/components/workspace/settings/LocationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const dashboardLocation = useDashboardLocation()
const siteId = await useDashboardOrganizationId()
const editor = await useLocationEditor(siteId, dashboardLocation.currentLocationId, 'status')
</script>
