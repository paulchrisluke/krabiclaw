<template>
  <ProductDetailPage :site-id="siteId" :vertical="detail.vertical" :product="detail.product" :location="detail.location" :reviews="detail.reviews" :booking="detail.booking" :collection-name="detail.collectionName" :collection-siblings="detail.collectionSiblings" :metafield-definitions="detail.metafieldDefinitions" :currency="detail.currency" :presentation="presentation" />
</template>

<script setup lang="ts">
import ProductDetailPage from '~/components/products/ProductDetailPage.vue'
import { EXPERIENCE_PRESENTATION } from '~/utils/product-presentation'
import { composeProductSeoDescription, isOfferedProduct } from '~/utils/product-seo'

definePageMeta({ layout: 'saya' })
// An experience is named by its own slug: this is the URL printed on the card
// the guest is holding. The branch it runs at comes from the product, which is
// offered at exactly one — several, and this URL names none of them.
const resolved = await usePublicProductDetail('experiences')
const siteId = resolved.siteId
const detail = computed(() => resolved.detail.value)
const presentation = EXPERIENCE_PRESENTATION
const { localePath, t } = useI18n()
/** The offer context this page quotes: the branch that runs it, the site currency, now. */
const priceSelection = computed(() => ({
  currency: detail.value.currency,
  location_id: detail.value.location.id,
  at: new Date().toISOString(),
}))
useSocialMetadata(() => ({
  path: presentation.productPath(detail.value.location.slug, detail.value.product.slug),
  // An experience with no applicable offer is not being sold, so it points at
  // the index instead of competing with it.
  canonicalPath: isOfferedProduct(detail.value.product, priceSelection.value) ? undefined : localePath(presentation.collectionPath),
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
