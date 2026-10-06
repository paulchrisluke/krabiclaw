<template>
  <DashboardLeafPanel
    id="organization-website-booking"
    title="Website booking"
    lead="This applies to all services on your website. Guests can choose times for published online services with a weekly schedule."
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <SettingRow v-model="editor.form.native_consultations" label="Let guests book on this website" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
const level = useRouteLevel()
// The switch exists only where the organization carries consultation settings.
// Read once the settings have loaded; a website without them has no such page.
watchEffect(() => {
  if (level.mode.value === 'yield' || editor.loading.value) return
  if (!editor.consultationMode.value) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
})
</script>
