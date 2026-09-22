<template>
  <DashboardLeafPanel
    id="location-post-action"
    :title="post.sectionLabels.value.action"
    :saving="post.editor.saving.value"
    :disabled="post.saveDisabled.value"
    :save-label="post.saveLabel.value"
    :error="post.editor.error.value ?? ''"
    @cancel="post.revert"
    @save="post.save"
  >
    <!-- A real section this post type does not have is named rather than left as a blank pane. -->
    <p v-if="!post.hasSection('action')" class="text-base text-muted">
      {{ post.typeLabel.value }} posts have no {{ post.sectionLabels.value.action.toLowerCase() }}.
    </p>
    <div v-else class="space-y-6">
      <p class="text-base text-muted">The button a guest sees under the post.</p>
      <UFormField label="Button">
        <USelect
          :model-value="post.editor.form.topic.call_to_action?.action_type ?? 'none'"
          :items="post.actionOptions.value"
          value-key="value"
          label-key="label"
          class="w-full"
          @update:model-value="post.setAction(String($event))"
        />
      </UFormField>
      <p v-if="post.editor.form.topic.call_to_action?.action_type === 'call'" class="text-sm text-muted">
        Calls the phone number saved on this location.
      </p>
      <UFormField v-else-if="post.editor.form.topic.call_to_action" label="Where it goes" required>
        <UInput v-model="post.editor.form.topic.call_to_action.url" type="url" placeholder="https://" class="w-full" />
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { postEditorKey } from '~/components/dashboard/PostEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const post = inject(postEditorKey)!
</script>
