<template>
  <DashboardLeafPanel
    id="site-analytics"
    title="Google Analytics"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    :footer="false"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <SiteGoogleAnalyticsSettings :organization-id="editor.organizationId" @changed="editor.refreshSettings" />
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SiteGoogleAnalyticsSettings from '~/components/dashboard/SiteGoogleAnalyticsSettings.vue'
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>
