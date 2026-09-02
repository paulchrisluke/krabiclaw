<template>
  <UDashboardPanel id="location-products">
    <template #header><UDashboardNavbar :toggle="false" :title="presentation.collectionLabel"><template #leading><DashboardNavbarLeading /></template></UDashboardNavbar></template>
    <template #body><UPage><UPageBody><ProductEditor v-if="location" :site-id="siteId" :location-id="location.id" :location-title="location.title" :currency="currency" :presentation="presentation" /></UPageBody></UPage></template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import ProductEditor from '~/components/products/ProductEditor.vue'
import { isCurrencyCode } from '~/shared/currencies'
import { requireProductPresentation } from '~/utils/product-presentation'
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.products' })
const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const location = computed(() => dashboardLocation.currentLocation.value)
const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
const presentation = requireProductPresentation(vertical)
const rawCurrency = dashboard.site.value?.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency
useSeoMeta({ title: `${presentation.collectionLabel} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })
</script>
