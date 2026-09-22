<template>
  <DashboardLeafPanel
    id="location-post-photo"
    :title="post.sectionLabels.value.photo"
    :saving="post.editor.saving.value"
    :disabled="post.saveDisabled.value"
    :save-label="post.saveLabel.value"
    :error="post.editor.error.value ?? ''"
    :footer="false"
    @cancel="post.revert"
    @save="post.save"
  >
    <!-- A real section this post type does not have is named rather than left as a blank pane. -->
    <p v-if="!post.hasSection('photo')" class="text-base text-muted">
      {{ post.typeLabel.value }} posts have no {{ post.sectionLabels.value.photo.toLowerCase() }}.
    </p>
    <div v-else class="space-y-4">
      <p class="text-base text-muted">The picture this post is recognised by, in the list and on your site.</p>
      <PostMediaFields
        v-model:media="post.editor.form.media"
        :site-id="post.siteId"
        :supports-media="post.supportsMedia.value"
      />
      <p v-if="post.supportsMedia.value" class="text-sm text-muted">Media saves with the post.</p>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import PostMediaFields from '~/components/dashboard/PostMediaFields.vue'
import { postEditorKey } from '~/components/dashboard/PostEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const post = inject(postEditorKey)!
</script>
