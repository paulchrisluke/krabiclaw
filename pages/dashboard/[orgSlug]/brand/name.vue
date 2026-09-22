<template>
  <DashboardLeafPanel
    id="site-name"
    title="Brand name"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <p class="mb-2 text-sm font-semibold text-muted">{{ editor.nameCharactersRemaining.value }}/50 available</p>
    <UInput v-model="editor.form.name" size="xl" maxlength="50" autofocus class="w-full" />
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>
