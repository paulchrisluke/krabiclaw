<template>
  <DashboardLeafPanel
    id="site-blog-post-canonical"
    title="Canonical URL"
    :ready="!editor.loadPending.value && !editor.loadError.value"
    :saving="editor.saving.value"
    :error="editor.actionError.value || editor.loadError.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Canonical URL">
      <UInput v-model="editor.form.canonical_url" autofocus :placeholder="editor.resolvedSeo.value.canonicalUrl" class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
</script>
