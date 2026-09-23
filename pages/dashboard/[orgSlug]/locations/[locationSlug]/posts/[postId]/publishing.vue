<template>
  <DashboardLeafPanel
    id="location-post-publishing"
    :title="post.sectionLabels.value.publishing"
    :saving="post.editor.saving.value"
    :disabled="post.saveDisabled.value"
    :save-label="post.saveLabel.value"
    :error="post.editor.error.value ?? ''"
    @cancel="post.revert"
    @save="post.save"
  >
    <!-- A real section this post type does not have is named rather than left as a blank pane. -->
    <p v-if="!post.hasSection('publishing')" class="text-base text-muted">
      {{ post.typeLabel.value }} posts have no {{ post.sectionLabels.value.publishing.toLowerCase() }}.
    </p>
    <div v-else class="space-y-6">
      <p v-if="post.postStatus.value === 'published'" class="text-base text-muted">
        This post is already live, so it no longer has a publishing time to set.
      </p>
      <template v-else>
        <p class="text-base text-muted">When this post goes live on your site.</p>
        <UFormField label="When">
          <USelect
            :model-value="post.editor.form.topic.scheduled_for ? 'later' : 'now'"
            :items="post.timingOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            @update:model-value="post.setTiming(String($event))"
          />
        </UFormField>
        <UFormField v-if="post.editor.form.topic.scheduled_for" label="Goes live (UTC)" required description="Must be in the future.">
          <UInput
            :model-value="instantDate(post.editor.form.topic.scheduled_for).toISOString().slice(0, -1)"
            type="datetime-local"
            step="any"
            class="w-full"
            @update:model-value="post.editor.form.topic.scheduled_for = $event ? scheduledLifecycleValue('Scheduled', String($event), 'UTC') : null"
          />
        </UFormField>
      </template>

      <div class="flex flex-wrap items-center gap-2 border-t border-default pt-4">
        <UButton :loading="post.editor.publishing.value" label="Publish…" @click="post.openPublish" />
        <UButton v-if="post.publicPath.value" :to="post.publicPath.value" target="_blank" size="sm" color="neutral" variant="soft" icon="i-lucide-external-link">
          View public post
        </UButton>
      </div>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { instantDate } from '~/utils/timezone'
import { scheduledLifecycleValue } from '~/utils/blog-editor'
import { postEditorKey } from '~/components/dashboard/PostEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const post = inject(postEditorKey)!
</script>
