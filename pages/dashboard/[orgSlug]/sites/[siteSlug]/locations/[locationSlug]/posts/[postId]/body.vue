<template>
  <DashboardLeafPanel
    id="location-post-body"
    :title="post.sectionLabels.value.body"
    :saving="post.editor.saving.value"
    :disabled="post.saveDisabled.value"
    :save-label="post.saveLabel.value"
    :error="post.editor.error.value ?? ''"
    @cancel="post.revert"
    @save="post.save"
  >
    <!-- A real section this post type does not have is named rather than left as a blank pane. -->
    <p v-if="!post.hasSection('body')" class="text-base text-muted">
      {{ post.typeLabel.value }} posts have no {{ post.sectionLabels.value.body.toLowerCase() }}.
    </p>
    <UFormField v-else label="Post" required>
      <UTextarea
        v-model="post.editor.form.body"
        :rows="10"
        autofocus
        placeholder="What's new? Write it the way you'd say it to a guest."
        size="xl"
        class="w-full"
      />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { postEditorKey } from '~/components/dashboard/PostEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const post = inject(postEditorKey)!
</script>
