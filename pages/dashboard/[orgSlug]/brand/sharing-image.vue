<template>
  <DashboardLeafPanel
    id="site-sharing-image"
    title="Social sharing image"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <MediaPicker v-model="editor.form.socialShareAssetId" :organization-id="editor.organizationId" accept="image" title="Select social sharing image" />
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>
