<template>
  <DashboardLeafPanel
    id="review-visibility"
    title="Visibility"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-4">
      <p class="text-base text-muted">A published review appears on your site. An archived review is hidden from it.</p>
      <URadioGroup v-model="editor.form.status" :items="REVIEW_VISIBILITY_ITEMS" />
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { reviewEditorKey } from '~/components/dashboard/ReviewEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const REVIEW_VISIBILITY_ITEMS = [
  { label: 'Published', value: 'approved', description: 'Shown on your site.' },
  { label: 'Archived', value: 'rejected', description: 'Hidden from your site.' },
]

const editor = inject(reviewEditorKey)!
</script>
