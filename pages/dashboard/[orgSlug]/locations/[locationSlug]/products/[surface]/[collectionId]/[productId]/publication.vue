<template>
  <DashboardLeafPanel
    id="product-publication"
    :ready="p.ready.value"
    :title="p.sectionLabels['publication']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || p.photoError.value || ''"
    @cancel="p.revert"
    @save="p.save"
  >
    <p class="mb-6 text-base text-muted">Choose whether customers can see this {{ p.presentation.value.itemLabel.toLowerCase() }}. Pausing orders or bookings keeps its information on your website.</p>
    <SettingRow v-model="p.form.published" label="Show on website" />
    <SettingRow v-model="p.form.active" :label="p.form.bookable || p.presentation.value.itemLabel === 'Service' ? 'Accept bookings' : 'Accept orders'" />
    <SettingRow v-if="p.locationId.value" v-model="p.form.location_published" label="Show at this location" />
    <SettingRow v-if="p.locationId.value" v-model="p.form.location_active" :label="p.form.bookable ? 'Accept bookings at this location' : 'Accept orders at this location'" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
</script>
