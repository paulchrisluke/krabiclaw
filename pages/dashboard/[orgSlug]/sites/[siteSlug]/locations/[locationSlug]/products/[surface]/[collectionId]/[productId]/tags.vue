<template>
  <DashboardLeafPanel
    id="product-tags"
    :title="p.sectionLabels['tags']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || p.photoError.value || ''"
    @cancel="p.revert"
    @save="p.save"
  >
    <UFormField label="Tags">
      <UInputTags v-model="p.form.tags" placeholder="Add a tag" :max="PRODUCT_LIMITS.tags" :max-length="PRODUCT_LIMITS.tag" delimiter="," add-on-blur add-on-paste class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { PRODUCT_LIMITS } from '~/shared/product-limits'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
</script>
