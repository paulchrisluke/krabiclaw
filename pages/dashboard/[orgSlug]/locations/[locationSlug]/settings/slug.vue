<template>
  <DashboardLeafPanel
    id="location-slug"
    title="Link"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Slug" description="The location's segment in its public URL.">
      <UInput v-model="editor.detailsForm.slug" size="xl" autofocus class="w-full" />
    </UFormField>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { useLocationEditor } from '~/lib/components/workspace/settings/LocationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const dashboardLocation = useDashboardLocation()
const siteId = await useDashboardOrganizationId()
const editor = await useLocationEditor(siteId, dashboardLocation.currentLocationId, 'slug')
</script>
