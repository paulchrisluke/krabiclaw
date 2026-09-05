<template>
  <div class="min-h-screen bg-default text-default">
    <AppBreadcrumb :crumbs="breadcrumbs" />
    <article class="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div class="rounded-2xl bg-elevated p-6 sm:p-10 lg:p-12">
        <div :class="product.image?.public_url ? 'grid gap-10 lg:grid-cols-2 items-start' : 'max-w-3xl'">
          <div v-if="product.image?.public_url">
            <img
              :src="product.image.public_url"
              :alt="product.image.alt_text || product.name"
              class="aspect-square w-full rounded-2xl object-cover"
            >
          </div>
          <div class="py-2">
            <p class="saya-kicker">{{ product.category.name }}</p>
            <h1 class="saya-display saya-italic mt-3 text-3xl sm:text-4xl lg:text-5xl text-default leading-tight">{{ product.name }}</h1>
            <p class="mt-2 text-sm sm:text-base text-muted">{{ location.title }}</p>
            <div v-if="formatProductPriceLabel(product)" class="mt-6 flex items-baseline gap-3 text-2xl font-semibold tabular-nums">
              <span v-if="product.price?.compare_at_amount_minor" class="text-base font-normal text-muted line-through">{{ formatProductMoney({ ...product.price, amount_minor: product.price.compare_at_amount_minor, compare_at_amount_minor: null }) }}</span>
              <span>{{ formatProductPriceLabel(product) }}</span>
            </div>
            <p v-if="product.description" class="mt-6 text-base sm:text-lg leading-relaxed text-muted">{{ product.description }}</p>
            <p v-if="!product.available" class="mt-6 font-semibold text-muted">{{ t('saya.common.temporarily_unavailable') }}</p>
            <div class="mt-8 flex flex-wrap items-center gap-5">
              <SayaButton
                v-if="product.available && product.order_url"
                :href="product.order_url"
                target="_blank"
                rel="noopener noreferrer"
                @click="recordExternalOrderClick"
              >{{ t('saya.cta.order_now') }}</SayaButton>
              <NuxtLink
                :to="localePath(presentation.collectionPath)"
                class="border-b border-default pb-0.5 text-xs font-bold uppercase tracking-widest text-default no-underline transition hover:opacity-60"
              >
                {{ t('saya.hero.view_menu') }} →
              </NuxtLink>
            </div>
            <dl v-if="visibleDetails.length" class="mt-10 divide-y divide-default border-y border-default">
              <div v-for="detail in visibleDetails" :key="detail.key" class="py-4">
                <dt class="font-medium">{{ detail.label }}</dt>
                <dd class="mt-1 text-sm text-muted">{{ detail.values.join(', ') }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <section v-if="product.gallery.length" class="mt-16">
        <h2 class="saya-display saya-italic text-4xl">{{ t('saya.footer.gallery') }}</h2>
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
        <h2 class="saya-display saya-italic text-4xl">{{ t('saya.footer.reviews') }}</h2>
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
import { minorAmountToMajor } from '~/shared/prices'
import { formatProductMoney, formatProductPriceLabel } from '~/utils/product-money'
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

const { trackProductOrder } = useSiteConversionTracking()
const { localePath, t } = useI18n()
const collectionLabel = computed(() => props.presentation.collectionPath === '/menu'
  ? t('saya.footer.menu')
  : t('saya.footer.products'))
const breadcrumbs = computed(() => [
  { to: localePath('/'), label: t('saya.experience_detail.home') },
  { to: localePath(props.presentation.collectionPath), label: collectionLabel.value },
  { to: localePath(productLocationCollectionPath(props.vertical, props.location.slug)), label: props.location.title },
  { to: localePath(props.presentation.productPath(props.location.slug, props.product.slug)), label: props.product.name },
])

const visibleDetails = computed(() => props.product.details.filter(detail => detail.key !== 'price-note'))

function recordExternalOrderClick() {
  if (!import.meta.client || props.analyticsEnabled === false) return
  trackProductOrder(
    props.location.id,
    props.product.id,
    props.presentation.productPath(props.location.slug, props.product.slug),
  )
}

useSchemaOrg(computed(() => ({
  '@type': props.presentation.structuredDataType,
  name: props.product.name,
  description: props.product.description,
  image: props.product.image?.public_url,
  offers: props.product.price
    ? {
        '@type': 'Offer',
        price: minorAmountToMajor(props.product.price.amount_minor, props.product.price.currency),
        priceCurrency: props.product.price.currency,
        availability: props.product.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: props.product.order_url || localePath(props.presentation.productPath(props.location.slug, props.product.slug)),
      }
    : undefined,
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
