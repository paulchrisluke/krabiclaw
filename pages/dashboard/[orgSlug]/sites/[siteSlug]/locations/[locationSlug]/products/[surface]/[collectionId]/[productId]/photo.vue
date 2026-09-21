<template>
  <DashboardLeafPanel
    id="product-photo"
    :title="p.sectionLabels['photo']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || p.photoError.value || ''"
    :footer="false"
    @cancel="p.revert"
    @save="p.save"
  >
    <div class="space-y-4">
      <p class="text-base text-muted">The picture guests recognise this by, in the list and on your site.</p>
      <DashboardCoverPhotoField
        :site-id="p.siteId"
        :location-id="p.locationId.value"
        :model-value="p.form.image_asset_id"
        :preview-url="p.product.value?.image?.public_url ?? null"
        :preview-alt="p.product.value?.image?.alt_text || p.form.name"
        :title="`${p.presentation.value.itemLabel} photo`"
        testid="product-photo"
        @update:model-value="p.setPrimaryImage"
      />
      <p class="text-sm text-muted">A photo saves as soon as you choose it.</p>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import DashboardCoverPhotoField from '~/components/dashboard/DashboardCoverPhotoField.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
</script>
