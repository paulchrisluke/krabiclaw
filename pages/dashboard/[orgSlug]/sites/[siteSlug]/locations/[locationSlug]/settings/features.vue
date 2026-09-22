<template>
  <DashboardLeafPanel
    id="location-features"
    title="Features"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div v-if="editor.locationToggleableFeatures.value.length" class="space-y-3">
      <UCard v-for="feature in editor.locationToggleableFeatures.value" :key="feature" variant="subtle">
        <UCheckbox v-model="editor.locationEnabledFeatureSet[feature]" :label="editor.locationFeatureLabel(feature)" />
      </UCard>
    </div>
    <p v-else class="text-sm text-muted">No location-specific modules are enabled for this site.</p>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { useLocationEditor } from '~/lib/components/workspace/settings/LocationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const dashboardLocation = useDashboardLocation()
const siteId = await useDashboardSiteId()
const editor = await useLocationEditor(siteId, dashboardLocation.currentLocationId, 'features')
</script>
