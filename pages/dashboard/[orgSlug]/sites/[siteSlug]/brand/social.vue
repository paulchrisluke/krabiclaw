<template>
  <DashboardLeafPanel
    id="site-social"
    title="Social profiles"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-6">
      <UFormField label="Facebook"><UInput v-model="editor.form.social_facebook_url" type="url" placeholder="https://facebook.com/..." size="xl" class="w-full" /></UFormField>
      <UFormField label="Instagram"><UInput v-model="editor.form.social_instagram_url" type="url" placeholder="https://instagram.com/..." size="xl" class="w-full" /></UFormField>
      <UFormField label="TikTok"><UInput v-model="editor.form.social_tiktok_url" type="url" placeholder="https://tiktok.com/@..." size="xl" class="w-full" /></UFormField>
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>
