<template>
  <DashboardLeafPanel id="product-visibility" title="Show on website" lead="Choose whether customers can see this page on your website." :saving="p.saving.value" :disabled="p.saveDisabled.value" :save-label="p.saveLabel.value" :error="p.loadError.value || p.saveError.value || ''" @cancel="p.revert" @save="p.save">
    <SettingRow v-if="p.isNew.value || p.product.value" v-model="p.form.published" label="Show on website" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'
definePageMeta({ layout: 'dashboard' })
const p = inject(productEditorKey)!
</script>
