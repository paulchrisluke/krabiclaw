<template>
  <DashboardLeafPanel
    id="location-post-offer"
    :title="post.sectionLabels.value.offer"
    :saving="post.editor.saving.value"
    :disabled="post.saveDisabled.value"
    :save-label="post.saveLabel.value"
    :error="post.editor.error.value ?? ''"
    @cancel="post.revert"
    @save="post.save"
  >
    <!-- A real section this post type does not have is named rather than left as a blank pane. -->
    <p v-if="!post.hasSection('offer')" class="text-base text-muted">
      {{ post.typeLabel.value }} posts have no {{ post.sectionLabels.value.offer.toLowerCase() }}.
    </p>
    <div v-else-if="post.editor.form.topic.offer" class="space-y-6">
      <p class="text-base text-muted">What a guest needs in order to claim it.</p>
      <UFormField label="Coupon code" description="Optional.">
        <UInput :model-value="post.editor.form.topic.offer.coupon_code ?? ''" class="w-full" @update:model-value="post.setOffer('coupon_code', String($event))" />
      </UFormField>
      <UFormField label="Link to redeem online" description="Optional.">
        <UInput :model-value="post.editor.form.topic.offer.redeem_online_url ?? ''" type="url" placeholder="https://" class="w-full" @update:model-value="post.setOffer('redeem_online_url', String($event))" />
      </UFormField>
      <UFormField label="Terms" description="Optional. Any restriction a guest should know before they arrive.">
        <UTextarea :model-value="post.editor.form.topic.offer.terms_conditions ?? ''" :rows="4" class="w-full" @update:model-value="post.setOffer('terms_conditions', String($event))" />
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { postEditorKey } from '~/components/dashboard/PostEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const post = inject(postEditorKey)!
</script>
