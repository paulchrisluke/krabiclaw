<template>
  <DashboardLeafPanel
    id="organization-page-title"
    title="Title"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :save-label="editor.saveLabel.value"
    :error="editor.loadError.value ?? editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField v-if="!editor.loadError.value" label="Title" required>
      <UInput v-model="editor.draft.value.title" maxlength="200" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { tenantPageEditorKey } from '~/components/dashboard/TenantPageEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(tenantPageEditorKey)!
</script>
