<template>
  <DashboardLeafPanel
    id="site-qa-visibility"
    title="Visibility"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :save-label="editor.saveLabel.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-4">
      <p class="text-base text-muted">A published question appears on the page it is filed under.</p>
      <UCheckbox v-model="editor.form.published" label="Published" />
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { qaEditorKey } from '~/components/dashboard/QaEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(qaEditorKey)!
</script>
