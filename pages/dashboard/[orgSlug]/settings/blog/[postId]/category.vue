<template>
  <DashboardLeafPanel
    id="organization-blog-post-category"
    title="Category"
    :ready="!editor.loadPending.value && !editor.loadError.value"
    :saving="editor.saving.value"
    :error="editor.actionError.value || editor.loadError.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-6">
      <!-- Every site publishes two collections, its blog and its docs; a category is the author's own word in both. -->
      <UFormField label="Collection">
        <USelect v-model="editor.form.collection" :items="editor.collectionOptions" value-key="value" class="w-full" />
      </UFormField>
      <UFormField label="Category">
        <UInput v-model="editor.form.category" autofocus class="w-full" />
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
</script>
