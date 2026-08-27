<template>
  <ProductCollectionPage :products="products" :locations="productLocations" :location-id="locationId" :currency="currency" :presentation="presentation" :vertical="vertical" :title="`${locationTitle} Products`" />
</template>

<script setup lang="ts">
import ProductCollectionPage from '~/components/products/ProductCollectionPage.vue'
import { isCurrencyCode } from '~/shared/currencies'
import { requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'saya' })
const { isBlawby } = usePublicTemplate()
if (isBlawby.value) throw createError({ statusCode: 404 })
const { products, locations, location, config, site } = await usePublicPageData({ lazy: false })
if (!location.value) throw createError({ statusCode: 404 })
const vertical = String(site.value?.vertical ?? '')
const presentation = requireProductPresentation(vertical)
if (presentation.locationCollectionSegment !== 'products') throw createError({ statusCode: 404 })
const rawCurrency = config.value.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency
const locationId = String(location.value.id)
const locationTitle = String(location.value.title)
const productLocations = computed(() => locations.value.map(item => ({ id: String(item.id), slug: String(item.slug), title: String(item.title) })))
useSocialMetadata(() => ({ path: `/locations/${encodeURIComponent(String(location.value?.slug))}/products`, title: `${locationTitle} Products`, description: `Products at ${locationTitle}.`, location: locationTitle, brand: { siteName: String(site.value?.brand_name ?? '') } }))
</script>
