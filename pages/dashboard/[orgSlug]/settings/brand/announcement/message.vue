<template>
  <DashboardLeafPanel
    id="organization-announcement-message"
    title="Message"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? editor.validationMessage.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Message" hint="Optional">
      <UTextarea v-model="editor.form.announcementDescription" :rows="4" maxlength="500" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
</script>
