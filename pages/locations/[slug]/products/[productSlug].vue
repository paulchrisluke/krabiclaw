<template>
  <ProductDetailPage :site-id="siteId" :vertical="detail.vertical" :product="detail.product" :location="detail.location" :reviews="detail.reviews" :collection-name="detail.collectionName" :collection-siblings="detail.collectionSiblings" :metafield-definitions="detail.metafieldDefinitions" :currency="detail.currency" :presentation="presentation" />
</template>

<script setup lang="ts">
import ProductDetailPage from '~/components/products/ProductDetailPage.vue'
import { requireProductPresentation } from '~/utils/product-presentation'
import { composeProductSeoDescription, isOfferedProduct } from '~/utils/product-seo'

definePageMeta({ layout: 'saya' })
const resolved = await usePublicProductDetail('products')
const siteId = resolved.siteId
const detail = computed(() => resolved.detail.value)
const presentation = requireProductPresentation(detail.value.vertical)
if (presentation.locationCollectionSegment !== 'products') throw createError({ statusCode: 404 })
const { localePath, t } = useI18n()
/** The offer context this page quotes: this location, the site currency, now. */
const priceSelection = computed(() => ({
  currency: detail.value.currency,
  location_id: detail.value.location.id,
  at: new Date().toISOString(),
}))
useSocialMetadata(() => ({
  path: presentation.productPath(detail.value.location.slug, detail.value.product.slug),
  // A product with no applicable offer is not being sold here, so it points at
  // the index instead of competing with it.
  canonicalPath: isOfferedProduct(detail.value.product, priceSelection.value) ? undefined : localePath(presentation.collectionPath),
  // The page's own title, not a second SEO field on the product.
  title: detail.value.product.name,
  description: composeProductSeoDescription({
    product: detail.value.product,
    locationTitle: detail.value.location.title,
    priceSelection: priceSelection.value,
  }, t),
  socialImage: detail.value.product.social_image,
  brand: { siteName: detail.value.brandName },
}))
</script>
