<template>
  <!--
    Which collections hold this product. Membership is plural — one product can
    sit in several — so every collection is a switch, and the collection keeps
    the order its members are shown in.
  -->
  <DashboardLeafPanel
    id="product-collections"
    :ready="p.ready.value"
    :title="p.sectionLabels['collections']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || ''"
    @cancel="p.revert"
    @save="p.save"
  >
    <SettingRow
      v-for="collection in rows"
      :key="collection.id"
      :model-value="p.form.collection_ids.includes(collection.id)"
      :label="collection.label"
      @update:model-value="toggle(collection.id, $event)"
    />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
// A collection that exists only at one location says so.
const rows = computed(() => p.collections.value.map(collection => ({
  id: collection.id,
  label: [collection.name, collection.location_id ? p.organizationLocations.value.find(location => location.id === collection.location_id)?.title : null].filter(Boolean).join(' · '),
})))
function toggle(collectionId: string, member: boolean) {
  p.form.collection_ids = member
    ? [...p.form.collection_ids.filter(id => id !== collectionId), collectionId]
    : p.form.collection_ids.filter(id => id !== collectionId)
}
</script>
