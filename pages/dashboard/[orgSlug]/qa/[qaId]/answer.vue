<template>
  <DashboardLeafPanel
    id="site-qa-answer"
    title="Answer"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :save-label="editor.saveLabel.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Answer">
      <UTextarea v-model="editor.form.answer" :rows="10" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { qaEditorKey } from '~/components/dashboard/QaEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(qaEditorKey)!
</script>
