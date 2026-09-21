<template>
  <DashboardLeafPanel
    id="location-post-headline"
    :title="post.sectionLabels.value.headline"
    :saving="post.editor.saving.value"
    :disabled="post.saveDisabled.value"
    :save-label="post.saveLabel.value"
    :error="post.editor.error.value ?? ''"
    @cancel="post.revert"
    @save="post.save"
  >
    <!-- A real section this post type does not have is named rather than left as a blank pane. -->
    <p v-if="!post.hasSection('headline')" class="text-base text-muted">
      {{ post.typeLabel.value }} posts have no {{ post.sectionLabels.value.headline.toLowerCase() }}.
    </p>
    <UFormField v-else label="Headline" description="Optional. Shown as the post's title on your site and in this list.">
      <UInput v-model="post.editor.form.title" size="xl" autofocus placeholder="Add a headline" class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { postEditorKey } from '~/components/dashboard/PostEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const post = inject(postEditorKey)!
</script>
