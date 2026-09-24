<template>
  <DashboardLeafPanel
    id="organization-links-seo-description"
    title="SEO description"
    :ready="editor.editorReady.value"
    :saving="editor.saving.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="SEO description">
      <UInput v-model="editor.form.seo_description" size="xl" maxlength="500" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { linksEditorKey } from '~/components/dashboard/LinksPageEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(linksEditorKey)!
</script>
