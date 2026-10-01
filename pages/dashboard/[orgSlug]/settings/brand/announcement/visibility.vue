<template>
  <DashboardLeafPanel
    id="organization-announcement-visibility"
    title="Show announcement"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? editor.validationMessage.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <SettingRow v-model="editor.form.announcementEnabled" label="Show announcement" description="A popup shown to visitors on your website." />
    <SettingRow v-if="editor.form.announcementEnabled" v-model="editor.form.announcementDismissible" label="Visitors can dismiss it" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
</script>
