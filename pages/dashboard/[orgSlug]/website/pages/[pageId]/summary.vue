<template>
  <DashboardLeafPanel
    id="organization-page-summary"
    title="Summary"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.loadError.value ?? editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField v-if="!editor.loadError.value" label="Summary">
      <UTextarea v-model="editor.draft.value.summary" :rows="5" autoresize autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { tenantPageEditorKey } from '~/components/dashboard/TenantPageEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(tenantPageEditorKey)!
</script>
