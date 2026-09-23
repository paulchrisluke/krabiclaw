<template>
  <DashboardLeafPanel
    id="site-search"
    title="Search engines"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-8">
      <UCard variant="subtle">
        <USwitch v-model="editor.searchIndexed.value" label="Visible to search engines" description="Allow the site to appear in search results." size="xl" />
      </UCard>
      <UFormField label="Google Search Console verification token">
        <UInput v-model="editor.form.google_site_verification" size="xl" class="w-full" />
      </UFormField>
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>
