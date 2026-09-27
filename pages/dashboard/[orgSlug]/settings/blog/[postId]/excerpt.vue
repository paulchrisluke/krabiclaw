<template>
  <DashboardLeafPanel
    id="organization-blog-post-excerpt"
    title="Excerpt"
    :ready="!editor.loadPending.value && !editor.loadError.value"
    :saving="editor.saving.value"
    :error="editor.actionError.value || editor.loadError.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Excerpt">
      <UTextarea v-model="editor.form.excerpt" :rows="5" autofocus :placeholder="editor.resolvedExcerpt.value" class="w-full" />
      <p class="mt-1 text-xs text-dimmed">{{ editor.form.excerpt ? 'Custom' : `Auto: ${editor.resolvedExcerpt.value}` }}</p>
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
</script>
