<template>
  <DashboardLeafPanel
    id="site-links-item-status"
    title="Status"
    :ready="editor.editorReady.value"
    :saving="editor.saving.value"
    :disabled="record.saveDisabled.value"
    :save-label="record.saveLabel.value"
    :error="editor.errorMessage.value"
    @cancel="record.revert"
    @save="record.save"
  >
    <UFormField label="Status" description="A hidden link stays on the page's list and off the public page.">
      <USelect v-model="record.itemForm.status" :items="LINK_STATUS_OPTIONS" size="xl" class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { linksEditorKey, LINK_STATUS_OPTIONS } from '~/components/dashboard/LinksPageEditor.vue'
import { linkRecordKey } from '../[itemId].vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(linksEditorKey)!
const record = inject(linkRecordKey)!
</script>
