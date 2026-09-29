<template>
  <DashboardLeafPanel
    id="organization-banner"
    title="Announcement banner"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-6">
      <UFormField label="Announcement text" description="Shown above the navigation on source-language pages of your Blawby website. Clear the text to remove the banner.">
        <UTextarea v-model="editor.form.banner_content" :rows="5" maxlength="500" autofocus class="w-full" />
      </UFormField>
      <UCheckbox v-model="editor.form.banner_dismissible" label="Allow visitors to dismiss the banner" />
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
</script>
