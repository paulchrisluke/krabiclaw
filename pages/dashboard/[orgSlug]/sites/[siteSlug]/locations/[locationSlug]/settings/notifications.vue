<template>
  <DashboardLeafPanel
    id="location-notifications"
    title="WhatsApp number"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="WhatsApp notification phone" help="Use international format, for example +66812345678.">
      <UInput v-model="editor.detailsForm.notification_phone" type="tel" placeholder="+66..." size="xl" class="w-full" />
    </UFormField>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { useLocationEditor } from '~/lib/components/workspace/settings/LocationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const dashboardLocation = useDashboardLocation()
const siteId = await useDashboardSiteId()
const editor = await useLocationEditor(siteId, dashboardLocation.currentLocationId, 'notifications')
</script>
