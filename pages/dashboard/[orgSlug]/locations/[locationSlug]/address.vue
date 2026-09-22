<template>
  <DashboardLeafPanel
    id="location-address"
    title="Address"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-6">
      <UFormField label="Street" help="One line per line."><UTextarea v-model="editor.detailsForm.addressLines" :rows="3" autofocus class="w-full" /></UFormField>
      <UFormField label="Neighbourhood"><UInput v-model="editor.detailsForm.sublocality" size="xl" class="w-full" /></UFormField>
      <UFormField label="City"><UInput v-model="editor.detailsForm.locality" size="xl" class="w-full" /></UFormField>
      <UFormField label="State or province"><UInput v-model="editor.detailsForm.administrativeArea" size="xl" class="w-full" /></UFormField>
      <UFormField label="Postcode"><UInput v-model="editor.detailsForm.postalCode" size="xl" class="w-full" /></UFormField>
      <UFormField label="Country" help="Two-letter code, e.g. TH."><UInput v-model="editor.detailsForm.regionCode" size="xl" class="w-full" /></UFormField>
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { useLocationEditor } from '~/lib/components/workspace/settings/LocationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const dashboardLocation = useDashboardLocation()
const organizationId = await useDashboardOrganizationId()
const editor = await useLocationEditor(organizationId, dashboardLocation.currentLocationId, 'address')
</script>
