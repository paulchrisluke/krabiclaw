<template>
  <!-- The share card is derived from the cover photo; there is nothing to save here. -->
  <DashboardLeafPanel id="organization-blog-post-share" title="Share preview" :footer="false">
    <img v-if="editor.resolvedPrimaryImageUrl.value" :src="editor.resolvedPrimaryImageUrl.value" alt="" class="aspect-video w-full rounded-lg object-cover">
    <video v-else-if="editor.resolvedPrimaryVideoUrl.value" :src="editor.resolvedPrimaryVideoUrl.value" controls muted playsinline class="aspect-video w-full rounded-lg object-cover" />
    <p v-else class="text-xs text-dimmed">This post has no cover photo, so its share card cannot be generated. Add a picture at the top of the article.</p>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
</script>
