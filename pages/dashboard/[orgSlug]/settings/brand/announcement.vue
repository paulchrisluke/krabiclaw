<template>
  <DashboardLeafPanel
    id="organization-announcement"
    title="Announcement"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-6">
      <UFormField label="Show announcement" description="A dismissible popup shown to visitors on your website.">
        <USwitch v-model="editor.form.announcementEnabled" />
      </UFormField>
      <template v-if="editor.form.announcementEnabled">
        <UFormField label="Image (optional)">
          <MediaPicker v-model="editor.form.announcementAssetId" :organization-id="editor.organizationId" accept="image" title="Select announcement image" />
        </UFormField>
        <UFormField label="Headline">
          <UInput v-model="editor.form.announcementHeadline" maxlength="120" size="xl" class="w-full" />
        </UFormField>
        <UFormField label="Description (optional)">
          <UTextarea v-model="editor.form.announcementDescription" :rows="4" maxlength="500" class="w-full" />
        </UFormField>
        <UFormField label="Button label (optional)">
          <UInput v-model="editor.form.announcementCtaLabel" size="xl" class="w-full" placeholder="Learn more" />
        </UFormField>
        <UFormField label="Button URL (optional)">
          <UInput v-model="editor.form.announcementCtaUrl" type="url" size="xl" class="w-full" placeholder="https://..." />
        </UFormField>
        <UCheckbox v-model="editor.form.announcementDismissible" label="Allow visitors to dismiss the announcement" />
      </template>
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
</script>
