<template>
  <!-- Everything in Catalog's scope in one list, whatever section it sits in. -->
  <DashboardIndexPanel id="catalog-all" title="All items">
    <UAlert v-if="loadError" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Catalog could not be loaded" :description="loadError" />
    <CatalogProductList v-else :products="catalog.products.value" :path="level.path.value" :price-label="priceLabel" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import CatalogProductList from '~/components/dashboard/CatalogProductList.vue'
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ layout: 'dashboard' })

const level = useRouteLevel()
const organizationId = await useDashboardOrganizationId()
const locationId = useLocationScope()
const catalog = useProductCatalog(organizationId, locationId)
const { locations } = await useOrganizationLocations()
const { priceLabel } = useCatalogPrice(locationId, locations)
const loadError = computed(() => (catalog.error.value ? getErrorMessage(catalog.error.value, 'The catalog could not be loaded') : null))

useSeoMeta({ title: 'All items | Krabiclaw Dashboard', robots: 'noindex, nofollow' })
</script>
