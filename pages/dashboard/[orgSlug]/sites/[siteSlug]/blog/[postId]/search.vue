<template>
  <DashboardLeafPanel
    id="site-blog-post-search"
    title="Search appearance"
    :ready="!editor.loadPending.value && !editor.loadError.value"
    :saving="editor.saving.value"
    :error="editor.actionError.value || editor.loadError.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-5">
      <div class="rounded-lg border border-default bg-muted p-3">
        <p class="truncate text-sm text-primary">{{ editor.resolvedSeo.value.title }}</p>
        <p class="truncate text-xs text-success">{{ editor.resolvedSeo.value.canonicalUrl }}</p>
        <p class="mt-1 line-clamp-2 text-xs text-muted">{{ editor.resolvedSeo.value.description }}</p>
      </div>
      <UFormField label="SEO title"><UInput v-model="editor.form.seo_title" :placeholder="editor.form.title" class="w-full" /></UFormField>
      <UFormField label="Meta description"><UTextarea v-model="editor.form.seo_description" :rows="4" :placeholder="editor.resolvedExcerpt.value" class="w-full" /></UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
</script>
