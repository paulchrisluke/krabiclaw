<template>
  <DashboardLeafPanel
    id="site-links-robots"
    title="Robots"
    :ready="editor.editorReady.value"
    :saving="editor.saving.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Robots" description="Whether search engines may index and follow the links page.">
      <USelect v-model="editor.form.robots" :items="ROBOTS_OPTIONS" size="xl" class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { linksEditorKey, ROBOTS_OPTIONS } from '~/components/dashboard/LinksPageEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(linksEditorKey)!
</script>
