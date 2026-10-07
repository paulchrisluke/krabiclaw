<template>
  <DashboardLeafPanel id="product-kind" title="Type" lead="Choose what customers are buying. Each type has its own useful details." :saving="p.saving.value" :disabled="p.saveDisabled.value" :save-label="p.saveLabel.value" :error="p.loadError.value || p.saveError.value || ''" @cancel="p.revert" @save="p.save">
    <URadioGroup v-if="p.isNew.value || p.product.value" v-model="p.form.kind" :items="items" variant="card" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'
definePageMeta({ layout: 'dashboard' })
const p = inject(productEditorKey)!
const items = [
  { value: 'dish', label: 'Food or drink' },
  { value: 'experience', label: 'Experience or class' },
  { value: 'service', label: 'Service or appointment' },
  { value: 'item', label: 'Physical item' },
]
</script>
