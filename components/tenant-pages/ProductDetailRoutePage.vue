<template>
  <ProductDetailPage :site-id="siteId" :vertical="detail.vertical" :product="detail.product" :location="detail.location" :reviews="detail.reviews" :currency="detail.currency" :presentation="presentation" />
</template>

<script setup lang="ts">
// Locale-prefixed counterpart to pages/locations/[slug]/(menu|products)/[productSlug].vue -
// same real themed <ProductDetailPage>, reached via the tenantPath catch-all
// (pages/[...tenantPath].vue, representation.kind === 'resource' with
// resource_type 'product') instead of Nuxt's file router, since a locale
// prefix can't match those pages directly. See
// components/tenant-pages/LocationQaPage.vue for why this isn't a route
// alias instead.
import ProductDetailPage from '~/components/products/ProductDetailPage.vue'
import { requireProductPresentation } from '~/utils/product-presentation'

const props = defineProps<{
  routeKind: 'menu' | 'products'
  locationSlug: string
  productSlug: string
}>()

const resolved = await usePublicProductDetail(props.routeKind, { locationSlug: props.locationSlug, productSlug: props.productSlug })
const siteId = resolved.siteId
const detail = computed(() => resolved.detail.value)
const presentation = requireProductPresentation(detail.value.vertical)
if (presentation.locationCollectionSegment !== props.routeKind) throw createError({ statusCode: 404 })
await useReciprocalHreflang(() => presentation.productPath(detail.value.location.slug, detail.value.product.slug))
useSocialMetadata(() => ({ path: presentation.productPath(detail.value.location.slug, detail.value.product.slug), title: detail.value.product.seo_title || detail.value.product.name, description: detail.value.product.seo_description || detail.value.product.description, robots: detail.value.product.robots, heroImage: detail.value.product.image?.public_url ? { url: detail.value.product.image.public_url } : null, location: detail.value.location.title, brand: { siteName: detail.value.brandName } }))
</script>
