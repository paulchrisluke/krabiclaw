<template>
  <!-- The share card is derived from the cover photo; there is nothing to save here. -->
  <UDashboardPanel id="site-blog-post-share">
    <template #header>
      <UDashboardNavbar title="Share preview" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-5xl">
        <img v-if="editor.resolvedPrimaryImageUrl.value" :src="editor.resolvedPrimaryImageUrl.value" alt="" class="aspect-video w-full rounded-lg object-cover">
        <video v-else-if="editor.resolvedPrimaryVideoUrl.value" :src="editor.resolvedPrimaryVideoUrl.value" controls muted playsinline class="aspect-video w-full rounded-lg object-cover" />
        <p v-else class="text-xs text-dimmed">This post has no cover photo, so its share card cannot be generated. Add a picture at the top of the article.</p>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
</script>
