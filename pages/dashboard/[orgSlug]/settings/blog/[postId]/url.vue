<template>
  <DashboardLeafPanel
    id="organization-blog-post-url"
    title="URL"
    :ready="!editor.loadPending.value && !editor.loadError.value"
    :saving="editor.saving.value"
    :error="editor.actionError.value || editor.loadError.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-5">
      <UFormField label="URL slug">
        <UInput v-model="editor.form.slug" :disabled="editor.slugResetRequested.value" autofocus class="w-full" />
        <div class="mt-1 flex items-center justify-between gap-3">
          <p class="text-xs text-dimmed">{{ editor.slugResetRequested.value ? editor.generatedSlug.value : editor.form.slug || editor.generatedSlug.value }}</p>
          <UButton v-if="editor.post.value?.slug_manually_overridden" size="xs" variant="link" @click="editor.resetSlugOverride">Use automatic slug</UButton>
        </div>
      </UFormField>
      <UCheckbox v-if="editor.post.value?.first_published_at && editor.form.slug !== editor.post.value.slug" v-model="editor.form.redirect_old_slug" label="Redirect old URL" />
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
</script>
