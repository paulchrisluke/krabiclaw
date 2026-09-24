<template>
  <DashboardLeafPanel
    id="organization-links-item-destination"
    title="Destination"
    :ready="editor.editorReady.value"
    :saving="editor.saving.value"
    :disabled="record.saveDisabled.value"
    :save-label="record.saveLabel.value"
    :error="editor.errorMessage.value"
    @cancel="record.revert"
    @save="record.save"
  >
    <UFormField label="Destination" required>
      <UInput
        v-model="record.itemForm.destination"
        placeholder="/reservations or https://example.com"
        maxlength="2048"
        size="xl"
        autofocus
        class="w-full"
      />
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
