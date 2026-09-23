<template>
  <DashboardLeafPanel
    id="location-post-schedule"
    :title="post.sectionLabels.value.schedule"
    :saving="post.editor.saving.value"
    :disabled="post.saveDisabled.value"
    :save-label="post.saveLabel.value"
    :error="post.editor.error.value ?? ''"
    @cancel="post.revert"
    @save="post.save"
  >
    <!-- A real section this post type does not have is named rather than left as a blank pane. -->
    <p v-if="!post.hasSection('schedule')" class="text-base text-muted">
      {{ post.typeLabel.value }} posts have no {{ post.sectionLabels.value.schedule.toLowerCase() }}.
    </p>
    <div v-else-if="post.editor.form.topic.event" class="space-y-6">
      <p class="text-base text-muted">
        {{ post.isOffer.value ? 'When the offer starts and stops.' : 'When it happens, and whether it repeats.' }}
      </p>
      <PostScheduleFields v-model="post.editor.form.topic.event" :is-offer="post.isOffer.value" />
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import PostScheduleFields from '~/components/dashboard/PostScheduleFields.vue'
import { postEditorKey } from '~/components/dashboard/PostEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const post = inject(postEditorKey)!
</script>
