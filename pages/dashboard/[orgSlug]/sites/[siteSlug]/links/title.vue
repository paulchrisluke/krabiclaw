<template>
  <DashboardLeafPanel
    id="site-links-title"
    title="Title"
    :ready="editor.editorReady.value"
    :saving="editor.saving.value"
    :disabled="!editor.form.title.trim()"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Title" required>
      <UInput v-model="editor.form.title" aria-label="Links page title" size="xl" maxlength="160" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { linksEditorKey } from '~/components/dashboard/LinksPageEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(linksEditorKey)!
</script>
