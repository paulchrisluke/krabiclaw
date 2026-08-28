<template>
  <div class="min-h-screen bg-default text-default">
    <AppBreadcrumb :crumbs="breadcrumbs" />
    <article class="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div class="grid gap-10 lg:grid-cols-2">
        <div>
          <img
            v-if="product.image?.public_url"
            :src="product.image.public_url"
            :alt="product.image.alt_text || product.name"
            class="aspect-square w-full rounded-2xl object-cover"
          >
        </div>
        <div class="py-4">
          <p class="saya-kicker">{{ product.category }}</p>
          <h1 class="saya-display-md mt-3">{{ product.name }}</h1>
          <p class="mt-2 text-sm text-muted">{{ location.title }}</p>
          <div class="mt-6 flex items-baseline gap-3 text-xl">
            <span v-if="saleActive && product.compare_at_price_amount" class="text-muted line-through">{{ formatProductMoney(product.compare_at_price_amount, currency) }}</span>
            <span class="font-semibold">{{ formatProductMoney(product.price_amount, currency) }}</span>
          </div>
          <p v-if="product.description" class="mt-8 leading-7 text-muted">{{ product.description }}</p>
          <p v-if="!product.available" class="mt-8 font-semibold text-muted">Currently unavailable</p>
          <SayaButton
            v-if="product.available && product.order_url"
            :href="product.order_url"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-8"
            @click="recordExternalOrderClick"
          >Order Now</SayaButton>
          <dl v-if="product.details.length" class="mt-10 divide-y divide-default border-y border-default">
            <div v-for="detail in product.details" :key="detail.key" class="py-4">
              <dt class="font-medium">{{ detail.label }}</dt>
              <dd class="mt-1 text-sm text-muted">{{ detail.values.join(', ') }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <section v-if="product.gallery.length" class="mt-16">
        <h2 class="saya-display saya-italic text-4xl">Gallery</h2>
        <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <img
            v-for="asset in product.gallery"
            :key="asset.asset_id"
            :src="asset.public_url"
            :alt="asset.alt_text || product.name"
            class="aspect-square w-full rounded-xl object-cover"
          >
        </div>
      </section>

      <section v-if="reviews.length" class="mt-16 border-t border-default pt-12">
        <h2 class="saya-display saya-italic text-4xl">Reviews</h2>
        <div class="mt-6 divide-y divide-default">
          <article v-for="review in reviews" :key="review.id" class="py-6">
            <div class="flex justify-between gap-4">
              <h3 class="font-semibold">{{ review.title }}</h3>
              <span>{{ review.rating }}/5</span>
            </div>
            <p class="mt-2 text-sm text-muted">{{ review.content }}</p>
            <p class="mt-3 text-xs text-muted">{{ review.author }}</p>
          </article>
        </div>
      </section>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { Product, ProductPresentation } from '~/server/types/products'
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import type { CurrencyCode } from '~/shared/currencies'
import { isSaleActive } from '~/shared/money'
import { formatProductMoney } from '~/utils/product-money'
import { productLocationCollectionPath } from '~/utils/product-presentation'

interface LocationSummary { id: string; slug: string; title: string }
interface ProductReview { id: string; author: string; rating: number; title: string; content: string; createdAt: string }

const props = defineProps<{
  siteId: string
  vertical: string
  product: Product
  location: LocationSummary
  reviews: ProductReview[]
  currency: CurrencyCode
  presentation: ProductPresentation
  analyticsEnabled?: boolean
}>()

const saleActive = computed(() => isSaleActive(props.product))
const breadcrumbs = computed(() => [
  { to: '/', label: 'Home' },
  { to: props.presentation.collectionPath, label: props.presentation.collectionLabel },
  { to: productLocationCollectionPath(props.vertical, props.location.slug), label: props.location.title },
  { to: props.presentation.productPath(props.location.slug, props.product.slug), label: props.product.name },
])

function recordExternalOrderClick() {
  if (!import.meta.client || props.analyticsEnabled === false) return
  fetch(`/api/public/sites/${encodeURIComponent(props.siteId)}/conversion-events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event_name: 'product_order_external_click',
      location_id: props.location.id,
      product_id: props.product.id,
      page_type: props.presentation.locationCollectionSegment,
      page_path: props.presentation.productPath(props.location.slug, props.product.slug),
    }),
    keepalive: true,
  }).catch(() => {})
}

useSchemaOrg(computed(() => ({
  '@type': props.presentation.structuredDataType,
  name: props.product.name,
  description: props.product.description,
  image: props.product.image?.public_url,
  offers: {
    '@type': 'Offer',
    price: props.product.price_amount,
    priceCurrency: props.currency,
    availability: props.product.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    url: props.product.order_url || props.presentation.productPath(props.location.slug, props.product.slug),
  },
  aggregateRating: props.reviews.length
    ? {
        '@type': 'AggregateRating',
        ratingValue: props.reviews.reduce((total, review) => total + review.rating, 0) / props.reviews.length,
        reviewCount: props.reviews.length,
      }
    : undefined,
  review: props.reviews.map(review => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: review.author },
    name: review.title,
    reviewBody: review.content,
    reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5 },
  })),
})))
</script>
