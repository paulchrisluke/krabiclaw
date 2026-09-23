<template>
  <DashboardLeafPanel
    id="site-blog-post-robots"
    title="Robots"
    :ready="!editor.loadPending.value && !editor.loadError.value"
    :saving="editor.saving.value"
    :error="editor.actionError.value || editor.loadError.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Robots">
      <UInput v-model="editor.form.robots" autofocus placeholder="index, follow" class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
</script>
