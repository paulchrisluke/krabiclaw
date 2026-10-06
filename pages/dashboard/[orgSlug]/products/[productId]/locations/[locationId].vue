<template>
  <DashboardLeafPanel
    id="product-location"
    :ready="p.ready.value && Boolean(location)"
    :title="location?.title ?? ''"
    lead="Choose whether this location shows it and takes orders or bookings for it. The location's own address and hours stay as they are."
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || ''"
    @cancel="p.revert"
    @save="p.save(level.to.value ?? undefined)"
  >
    <template v-if="entry">
      <SettingRow v-model="entry.published" label="Show at this location" />
      <SettingRow v-model="entry.active" label="Accept at this location" />
    </template>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
const route = useRoute()
const level = useRouteLevel()
const locationId = computed(() => String(route.params.locationId))
const location = computed(() => p.organizationLocations.value.find(entry => entry.id === locationId.value) ?? null)
// A location the product is not offered at starts off on both switches; saving
// is what offers it there.
watchEffect(() => {
  if (location.value && !p.form.locations[locationId.value]) p.form.locations[locationId.value] = { active: false, published: false }
})
const entry = computed(() => (location.value ? p.form.locations[locationId.value] ?? null : null))

// A location this organization does not have is not a page.
watchEffect(() => {
  if (level.mode.value === 'yield' || !p.ready.value || p.organizationLocationsError.value) return
  if (p.organizationLocations.value.length && !location.value) showError(createError({ statusCode: 404, statusMessage: 'Location not found' }))
})
</script>
