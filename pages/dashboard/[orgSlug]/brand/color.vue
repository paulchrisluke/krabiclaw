<template>
  <DashboardLeafPanel
    id="site-color"
    title="Brand color"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-8">
      <UColorPicker v-model="editor.form.brand_color" format="hex" size="xl" class="w-full" />
      <UFormField label="Hex color">
        <UInput v-model="editor.form.brand_color" maxlength="7" placeholder="#0f766e" size="xl" class="w-full" />
      </UFormField>
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>
