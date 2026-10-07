<template>
  <DashboardLeafPanel
    id="organization-search"
    title="Search appearance"
    lead="The title and description search engines show for the homepage and any page without its own. Left empty, they fall back to the brand name and description."
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Title" hint="Optional">
      <UInput v-model="editor.form.seo_title" class="w-full" />
    </UFormField>
    <UFormField class="mt-6" label="Description" hint="Optional">
      <UTextarea v-model="editor.form.seo_description" :rows="4" autoresize class="w-full" />
    </UFormField>
    <UFormField class="mt-6" label="Homepage canonical URL" hint="Optional">
      <UInput v-model="editor.form.canonical_url" type="url" placeholder="https://" class="w-full" />
    </UFormField>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
</script>
