<template>
  <DashboardLeafPanel
    id="site-page-summary"
    title="Summary"
    :ready="editor.ready.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Summary" description="A concise introduction used when the page needs one.">
      <UTextarea v-model="editor.draft.value.summary" :rows="5" autoresize autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { tenantPageEditorKey } from '~/components/dashboard/TenantPageEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(tenantPageEditorKey)!
</script>
