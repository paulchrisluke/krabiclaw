<template>
  <DashboardIndexPanel id="product-publication" :title="p.sectionLabels['publication']">
    <EditorNavigationList :groups="groups" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'
definePageMeta({ layout: 'dashboard' })
const p = inject(productEditorKey)!
const level = useRouteLevel()
const groups = computed(() => [{ id: 'website', items: [
  { id: 'visibility', label: 'Show on website', summary: p.form.published ? 'Visible to customers' : 'Hidden from customers', to: `${level.path.value}/visibility` },
  { id: 'availability', label: p.form.bookable || p.form.kind === 'service' ? 'Accept bookings' : 'Accept orders', summary: p.form.active ? 'Customers can book or order' : 'Paused — the page can stay visible', to: `${level.path.value}/availability` },
] }])
</script>
