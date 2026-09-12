<template>
  <ProductCollectionPage :products="experiences" :collections="collections" :locations="productLocations" :location-id="locationId" :currency="currency" :presentation="presentation" :vertical="vertical" :title="collectionTitle" :brand-name="brandName" />
</template>

<script setup lang="ts">
import ProductCollectionPage from '~/components/products/ProductCollectionPage.vue'
import { isCurrencyCode } from '~/shared/currencies'
import { EXPERIENCE_PRESENTATION, isExperience, resolveProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'saya' })
const { isBlawby } = usePublicTemplate()
if (isBlawby.value) throw createError({ statusCode: 404 })
const { products, collections, locations, location, config, site } = await usePublicPageData({ lazy: false })
const currentLocation = location.value
if (!currentLocation) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
const vertical = String(site.value?.vertical ?? '')
if (!resolveProductPresentation(vertical)) throw createError({ statusCode: 404 })
const presentation = EXPERIENCE_PRESENTATION
const rawCurrency = config.value.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency
const brandName = String(site.value?.brand_name ?? '').trim()
if (!brandName) throw createError({ statusCode: 500, statusMessage: 'Site brand is unavailable' })
const { t } = useI18n()
const experiences = computed(() => products.value.filter(isExperience))
// A site with nothing to book has no experiences page, rather than an
// indexable empty one.
if (experiences.value.length === 0) throw createError({ statusCode: 404 })
const locationId = currentLocation.id
const collectionTitle = computed(() => t('saya.experiences.collection_title', { site: currentLocation.title }))
const productLocations = computed(() => locations.value.map(item => ({ id: String(item.id), slug: String(item.slug), title: String(item.title) })))
useSocialMetadata(() => ({
  path: `/locations/${encodeURIComponent(currentLocation.slug)}/experiences`,
  title: collectionTitle.value,
  description: t('saya.experiences.meta_description', { site: currentLocation.title }),
  socialImage: currentLocation.social_image ?? null,
  brand: { siteName: brandName },
}))
</script>
