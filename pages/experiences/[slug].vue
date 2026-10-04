<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
  <ProductDetailPage :organization-id="organizationId" :vertical="detail.vertical" :product="detail.product" :location="detail.location" :organization-name="detail.brandName" :reviews="detail.reviews" :booking="detail.booking" :sessions="detail.sessions" :collection-name="detail.collectionName" :collection-siblings="detail.collectionSiblings" :currency="detail.currency" :presentation="presentation" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import ProductDetailPage from '~/components/products/ProductDetailPage.vue'
import { EXPERIENCE_PRESENTATION } from '~/utils/product-presentation'
import { composeProductSeoDescription } from '~/utils/product-seo'

definePageMeta({ layout: false })
const { isBlawby } = usePublicTemplate()
if (isBlawby.value) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
// An experience is named by its own slug: this is the URL printed on the card
// the guest is holding. The branch it runs at comes from the product, which is
// offered at exactly one — several, and this URL names none of them.
const resolved = await usePublicProductDetail('experiences')
const organizationId = resolved.organizationId
const detail = computed(() => resolved.detail.value)
const presentation = computed(() => detail.value.location ? EXPERIENCE_PRESENTATION : { ...EXPERIENCE_PRESENTATION, collectionPath: '/schedule' as const, collectionLabel: 'Consultations' as const })
const { t } = useI18n()
/** The offer context this page quotes: the branch that runs it, the site currency, now. */
const priceSelection = computed(() => ({
  currency: detail.value.currency,
  location_id: detail.value.location?.id ?? null,
  at: new Date().toISOString(),
}))
useSocialMetadata(() => ({
  path: presentation.value.productPath(detail.value.location?.slug ?? '', detail.value.product.slug),
  // An experience with no applicable offer is not being sold, so it points at
  // the index instead of competing with it.
  title: detail.value.product.name,
  description: composeProductSeoDescription({
    product: detail.value.product,
    locationTitle: detail.value.location?.title ?? detail.value.brandName,
    priceSelection: priceSelection.value,
  }, t),
  socialImage: detail.value.product.social_image,
  brand: { organizationName: detail.value.brandName },
  breadcrumbs: detail.value.location ? [
    { name: 'Locations', url: '/locations' },
    { name: detail.value.location.title, url: `/locations/${detail.value.location.slug}` },
    { name: 'Experiences', url: `/locations/${detail.value.location.slug}/experiences` },
    { name: detail.value.product.name, url: presentation.value.productPath(detail.value.location.slug, detail.value.product.slug) },
  ] : [
    { name: 'Consultations', url: '/schedule' },
    { name: detail.value.product.name, url: presentation.value.productPath('', detail.value.product.slug) },
  ],
}))
</script>
