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
    <!-- Three switches, three questions: off sale does not hide it, and hidden does not mean sold out. -->
    <SettingRow v-model="p.form.active" label="On sale" description="Off means you are not selling it anywhere." />
    <SettingRow v-model="p.form.published" label="Published on this site" />
    <SettingRow v-model="p.form.location_published" label="Shown at this location" />
    <SettingRow v-model="p.form.location_active" label="Sold at this location" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
</script>
