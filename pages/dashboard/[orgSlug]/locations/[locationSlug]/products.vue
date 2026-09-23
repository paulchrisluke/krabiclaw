<template>
  <DashboardIndexPanel id="location-catalog" :title="catalogTitle">
    <CatalogSurfaceList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import CatalogSurfaceList from '~/components/dashboard/CatalogSurfaceList.vue'
import { catalogLabel, countCatalog } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard' })

const dashboard = useDashboardOrganization()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.organization.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })

const organizationId = await useDashboardOrganizationId()
const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)
// The same catalog the surfaces below read, so titling this column costs no request.
const catalog = useLocationProductCatalog(organizationId, locationId)
// This level is the catalog, not one of its surfaces: a restaurant that also
// takes bookings holds a Menu and Experiences, and neither names the other.
const catalogTitle = computed(() => catalogLabel(vertical, countCatalog(catalog.products.value)))</script>
