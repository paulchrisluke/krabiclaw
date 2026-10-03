<template>
  <DashboardLeafPanel id="product-visibility" :ready="p.ready.value" title="Show on website" lead="Choose whether customers can see this page on your website." :saving="p.saving.value" :disabled="p.saveDisabled.value" :save-label="p.saveLabel.value" :error="p.saveError.value || ''" @cancel="p.revert" @save="p.save">
    <SettingRow v-model="p.form.published" label="Show on website" />
    <SettingRow v-if="p.locationId.value" v-model="p.form.location_published" label="Show at this location" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'
definePageMeta({ layout: 'dashboard' })
const p = inject(productEditorKey)!
</script>
