<template>
  <ProductCollectionPage :products="goods" :collections="collections" :locations="productLocations" :currency="currency" :presentation="presentation" :vertical="vertical" :title="collectionTitle" :brand-name="brandName" />
</template>

<script setup lang="ts">
import ProductCollectionPage from '~/components/products/ProductCollectionPage.vue'
import { isCurrencyCode } from '~/shared/currencies'
import { isExperience, requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'saya' })
const { isBlawby } = usePublicTemplate()
if (isBlawby.value) throw createError({ statusCode: 404 })
const { t } = useI18n()
const { products, collections, locations, config, site } = await usePublicPageData({ lazy: false })
// What the merchant sells over the counter. Anything a guest books a seat on
// is an Experience and has its own surface, so it is not listed twice.
const goods = computed(() => products.value.filter(product => !isExperience(product)))
// A surface with nothing on it is not a page: a studio that sells no
// merchandise has no /products, rather than an indexable empty one. The
// navigation hides it for the same reason.
if (goods.value.length === 0) throw createError({ statusCode: 404 })
const vertical = String(site.value?.vertical ?? '')
const presentation = requireProductPresentation(vertical)
if (presentation.locationCollectionSegment !== 'products') throw createError({ statusCode: 404 })
const rawCurrency = config.value.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency
const brandName = String(site.value?.brand_name ?? '').trim()
const collectionTitle = computed(() => t('saya.products.collection_title', { site: brandName }))
const productLocations = computed(() => locations.value.map(location => ({ id: String(location.id), slug: String(location.slug), title: String(location.title) })))
useSocialMetadata(() => ({ path: presentation.collectionPath, title: collectionTitle.value, description: t('saya.products.meta_description', { site: brandName }), brand: { siteName: brandName } }))
</script>
