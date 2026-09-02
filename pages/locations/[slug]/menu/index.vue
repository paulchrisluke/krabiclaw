<template>
  <ProductCollectionPage :products="products" :locations="productLocations" :location-id="locationId" :currency="currency" :presentation="presentation" :vertical="vertical" :title="`${locationTitle} Menu`" :brand-name="brandName" :empty-experience-href="emptyExperienceHref" />
</template>

<script setup lang="ts">
import ProductCollectionPage from '~/components/products/ProductCollectionPage.vue'
import { isCurrencyCode } from '~/shared/currencies'
import { resolveLocationExperienceHref } from '~/utils/experience-navigation'
import { requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'saya' })
const { isBlawby } = usePublicTemplate()
if (isBlawby.value) throw createError({ statusCode: 404 })
const { products, locations, location, config, site, experiencesList } = await usePublicPageData({ lazy: false })
const currentLocation = location.value
if (!currentLocation) throw createError({ statusCode: 404 })
const brandName = site.value?.brand_name
if (typeof brandName !== 'string' || brandName.trim().length === 0) throw createError({ statusCode: 500, statusMessage: 'Site brand is unavailable' })
const vertical = String(site.value?.vertical ?? '')
const presentation = requireProductPresentation(vertical)
if (presentation.locationCollectionSegment !== 'menu') throw createError({ statusCode: 404 })
const rawCurrency = config.value.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency
const locationId = currentLocation.id
const locationTitle = currentLocation.title
const productLocations = computed(() => locations.value.map(item => ({ id: item.id, slug: item.slug, title: item.title })))
const emptyExperienceHref = computed(() => resolveLocationExperienceHref(currentLocation.slug, experiencesList.value))
useSocialMetadata(() => ({ path: `/locations/${encodeURIComponent(currentLocation.slug)}/menu`, title: `${locationTitle} Menu`, description: `Full menu for ${locationTitle}.`, socialImage: location.value?.social_image ?? null, brand: { siteName: brandName } }))
</script>
