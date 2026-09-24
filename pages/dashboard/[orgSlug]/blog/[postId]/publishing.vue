<template>
  <DashboardLeafPanel
    id="organization-blog-post-publishing"
    title="When it goes live"
    :ready="!editor.loadPending.value && !editor.loadError.value"
    :saving="editor.saving.value"
    :error="editor.actionError.value || editor.loadError.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <!--
      Save carries the lifecycle change too: what the fields say when you press
      Save is what the post becomes. One commit mechanism, like every leaf.
    -->
    <div class="space-y-5">
      <UFormField label="Status">
        <p class="text-sm text-muted">{{ editor.lifecycleLabel.value }}</p>
      </UFormField>
      <UFormField v-if="!editor.post.value || editor.post.value.status === 'scheduled'" label="Publish timing">
        <USelect v-model="editor.publishTiming.value" :items="['Now', 'Scheduled']" class="w-full" />
      </UFormField>
      <UFormField v-if="(!editor.post.value || editor.post.value.status === 'scheduled') && editor.publishTiming.value === 'Scheduled'" label="Scheduled for (UTC)">
        <UInput v-model="editor.form.scheduled_for" type="datetime-local" step="any" class="w-full" />
      </UFormField>
      <UFormField label="Visibility" :description="editor.form.visibility === 'unlisted' ? 'Anyone with the link can read it. It stays out of the blog, search, feeds and the sitemap.' : 'Appears in the blog, search, feeds and the sitemap.'">
        <USelect v-model="editor.form.visibility" :items="[{ label: 'Listed', value: 'listed' }, { label: 'Unlisted', value: 'unlisted' }]" class="w-full" />
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
</script>
