<template>
  <DashboardLeafPanel
    id="location-post-type"
    :title="post.sectionLabels.value.type"
    :saving="post.editor.saving.value"
    :disabled="post.saveDisabled.value"
    :save-label="post.saveLabel.value"
    :error="post.editor.error.value ?? ''"
    @cancel="post.revert"
    @save="post.save"
  >
    <!-- A real section this post type does not have is named rather than left as a blank pane. -->
    <p v-if="!post.hasSection('type')" class="text-base text-muted">
      {{ post.typeLabel.value }} posts have no {{ post.sectionLabels.value.type.toLowerCase() }}.
    </p>
    <!-- Only a post being created has a type: the contract's shape is chosen by it, so an existing post cannot change it. -->
    <UFormField v-else label="What are you posting?">
      <URadioGroup
        :model-value="post.postType.value"
        :items="post.typeOptions"
        :ui="{ fieldset: 'flex flex-wrap gap-4' }"
        @update:model-value="post.setType(String($event))"
      />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { postEditorKey } from '~/components/dashboard/PostEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const post = inject(postEditorKey)!
</script>
