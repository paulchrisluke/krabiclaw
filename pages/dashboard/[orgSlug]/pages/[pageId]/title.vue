<template>
  <DashboardLeafPanel
    id="site-page-title"
    title="Title"
    :ready="editor.ready.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :save-label="editor.saveLabel.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Title" required>
      <UInput v-model="editor.draft.value.title" size="xl" maxlength="200" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { tenantPageEditorKey } from '~/components/dashboard/TenantPageEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(tenantPageEditorKey)!
</script>
