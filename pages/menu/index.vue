<template>
  <ProductCollectionPage :products="goods" :collections="collections" :locations="productLocations" :currency="currency" :presentation="presentation" :vertical="vertical" :title="`${brandName} Menu`" :brand-name="brandName" />
</template>

<script setup lang="ts">
import ProductCollectionPage from '~/components/products/ProductCollectionPage.vue'
import { isCurrencyCode } from '~/shared/currencies'
import { isExperience, requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'saya' })
const { isBlawby } = usePublicTemplate()
if (isBlawby.value) throw createError({ statusCode: 404 })
const { products, collections, locations, config, site } = await usePublicPageData({ lazy: false })
// What the merchant sells over the counter. Anything a guest books a seat on
// is an Experience and has its own surface, so it is not listed twice.
const goods = computed(() => products.value.filter(product => !isExperience(product)))
const vertical = String(site.value?.vertical ?? '')
const presentation = requireProductPresentation(vertical)
if (presentation.locationCollectionSegment !== 'menu') throw createError({ statusCode: 404 })
const rawCurrency = config.value.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency
const brandName = site.value?.brand_name
if (typeof brandName !== 'string' || brandName.trim().length === 0) throw createError({ statusCode: 500, statusMessage: 'Site brand is unavailable' })
const productLocations = computed(() => locations.value.map(location => ({ id: location.id, slug: location.slug, title: location.title })))
useSocialMetadata(() => ({ path: presentation.collectionPath, title: `${brandName} Menu`, description: `Full menu at ${brandName}.`, brand: { siteName: brandName } }))
</script>
