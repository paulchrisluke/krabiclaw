<template>
  <DashboardLeafPanel
    id="site-links-item-label"
    title="Label"
    :ready="editor.editorReady.value"
    :saving="editor.saving.value"
    :disabled="record.saveDisabled.value"
    :save-label="record.saveLabel.value"
    :error="editor.errorMessage.value"
    @cancel="record.revert"
    @save="record.save"
  >
    <UFormField label="Label" required>
      <UInput v-model="record.itemForm.label" maxlength="120" size="xl" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { linksEditorKey } from '~/components/dashboard/LinksPageEditor.vue'
import { linkRecordKey } from '../[itemId].vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(linksEditorKey)!
const record = inject(linkRecordKey)!
</script>
