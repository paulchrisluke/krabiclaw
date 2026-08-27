<template>
  <ProductCollectionPage :products="products" :locations="productLocations" :currency="currency" :presentation="presentation" :vertical="vertical" :title="`${brandName} Menu`" />
</template>

<script setup lang="ts">
import ProductCollectionPage from '~/components/products/ProductCollectionPage.vue'
import { isCurrencyCode } from '~/shared/currencies'
import { requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'saya' })
const { isBlawby } = usePublicTemplate()
if (isBlawby.value) throw createError({ statusCode: 404 })
const { products, locations, config, site } = await usePublicPageData({ lazy: false })
const vertical = String(site.value?.vertical ?? '')
const presentation = requireProductPresentation(vertical)
if (presentation.locationCollectionSegment !== 'menu') throw createError({ statusCode: 404 })
const rawCurrency = config.value.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency
const brandName = String(site.value?.brand_name ?? '').trim()
const productLocations = computed(() => locations.value.map(location => ({ id: String(location.id), slug: String(location.slug), title: String(location.title) })))
useSocialMetadata(() => ({ path: presentation.collectionPath, title: `${brandName} Menu`, description: `Full menu at ${brandName}.`, label: presentation.collectionLabel, brand: { siteName: brandName } }))
</script>
