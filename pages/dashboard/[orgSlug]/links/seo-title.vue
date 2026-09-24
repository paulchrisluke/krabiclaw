<template>
  <DashboardLeafPanel
    id="organization-links-seo-title"
    title="SEO title"
    :ready="editor.editorReady.value"
    :saving="editor.saving.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="SEO title">
      <UInput v-model="editor.form.seo_title" size="xl" maxlength="200" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { linksEditorKey } from '~/components/dashboard/LinksPageEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(linksEditorKey)!
</script>
