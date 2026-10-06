<template>
  <DashboardLeafPanel id="product-availability" :ready="p.ready.value" title="Accept bookings or orders" lead="Pause bookings or orders whenever you need to. Its information can stay on your website." :saving="p.saving.value" :disabled="p.saveDisabled.value" :save-label="p.saveLabel.value" :error="p.saveError.value || ''" @cancel="p.revert" @save="p.save">
    <SettingRow v-model="p.form.active" :label="p.form.bookable || p.form.kind === 'service' ? 'Accept bookings' : 'Accept orders'" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'
definePageMeta({ layout: 'dashboard' })
const p = inject(productEditorKey)!
</script>
