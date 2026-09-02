<template>
  <ProductDetailPage :site-id="siteId" :vertical="detail.vertical" :product="detail.product" :location="detail.location" :reviews="detail.reviews" :currency="detail.currency" :presentation="presentation" />
</template>

<script setup lang="ts">
import ProductDetailPage from '~/components/products/ProductDetailPage.vue'
import { requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'saya' })
const resolved = await usePublicProductDetail('menu')
const siteId = resolved.siteId
const detail = computed(() => resolved.detail.value)
const presentation = requireProductPresentation(detail.value.vertical)
if (presentation.locationCollectionSegment !== 'menu') throw createError({ statusCode: 404 })
useSocialMetadata(() => ({ path: presentation.productPath(detail.value.location.slug, detail.value.product.slug), title: detail.value.product.seo_title || detail.value.product.name, description: detail.value.product.seo_description || detail.value.product.description, robots: detail.value.product.robots, socialImage: detail.value.product.social_image, brand: { siteName: detail.value.brandName } }))
</script>
