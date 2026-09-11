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
            <p class="saya-kicker">{{ collectionName }}</p>
            <h1 class="saya-display saya-italic mt-3 text-3xl sm:text-4xl lg:text-5xl text-default leading-tight">{{ product.name }}</h1>
            <p class="mt-2 text-sm sm:text-base text-muted">{{ location.title }}</p>
            <div v-if="priceLabel" class="mt-6 flex items-baseline gap-3 text-2xl font-semibold tabular-nums">
              <span v-if="compareAtLabel" class="text-base font-normal text-muted line-through">{{ compareAtLabel }}</span>
              <span>{{ priceLabel }}</span>
            </div>
            <p v-if="product.description" class="mt-6 text-base sm:text-lg leading-relaxed text-muted">{{ product.description }}</p>
            <p v-if="!isAvailable" class="mt-6 font-semibold text-muted">{{ t('saya.common.temporarily_unavailable') }}</p>
            <div class="mt-8 flex flex-wrap items-center gap-5">
              <SayaButton
                v-if="isAvailable && product.order_url"
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

      <!-- Siblings in the collection this page was reached through. Derived
           entirely from membership, so every page's body text varies by real
           data and every item in a collection is reachable by internal link. -->
      <section v-if="collectionSiblings.length" class="mt-16 border-t border-default pt-12">
        <h2 class="saya-display saya-italic text-3xl sm:text-4xl">{{ t('saya.product_detail.more_in_category', { category: collectionName }) }}</h2>
        <ul class="mt-6 grid gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="sibling in collectionSiblings" :key="sibling.id">
            <NuxtLink
              :to="localePath(presentation.productPath(location.slug, sibling.slug))"
              class="text-base text-default no-underline transition hover:opacity-60"
            >{{ sibling.name }}</NuxtLink>
          </li>
        </ul>
      </section>

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
import { minorAmountToMajor, selectPrice, type Price } from '~/shared/prices'
import { formatProductMoney } from '~/utils/product-money'
import { productLocationCollectionPath } from '~/utils/product-presentation'
import type { ProductCollectionSibling } from '~/utils/product-seo'
import type { MetafieldDefinition } from '~/shared/metafields'
import { metafieldHandle } from '~/shared/metafields'

interface LocationSummary { id: string; slug: string; title: string }
interface ProductReview { id: string; author: string; rating: number; title: string; content: string; createdAt: string }

const props = defineProps<{
  siteId: string
  vertical: string
  product: Product
  location: LocationSummary
  reviews: ProductReview[]
  collectionName: string
  collectionSiblings: ProductCollectionSibling[]
  /** The tenant's attribute vocabulary, so this page can label its own facts. */
  metafieldDefinitions: MetafieldDefinition[]
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

/**
 * The offer this page quotes, resolved once through the one selection
 * contract. A product with several variants shows its lowest applicable offer;
 * each variant's own price is on this page under its option.
 */
const offer = computed<Price | null>(() => {
  const selection = { currency: props.currency, location_id: props.location.id, at: new Date().toISOString() }
  const offers = props.product.variants.flatMap(variant => selectPrice(variant.prices, selection) ?? [])
  return offers.reduce<Price | null>((lowest, candidate) => (!lowest || candidate.unit_amount < lowest.unit_amount ? candidate : lowest), null)
})
const priceLabel = computed(() => formatProductMoney(offer.value))
const compareAtLabel = computed(() => {
  const price = offer.value
  if (!price || price.compare_at_unit_amount === null) return null
  return formatProductMoney({ ...price, unit_amount: price.compare_at_unit_amount, compare_at_unit_amount: null })
})

/**
 * Whether a customer can buy this here: the merchant is selling it, this
 * location offers it, and an applicable price exists. Three facts, all
 * required, none substituting for another.
 */
const isAvailable = computed(() =>
  props.product.active
  && props.product.locations.some(entry => entry.location_id === props.location.id && entry.active)
  && offer.value !== null)

/**
 * The labelled facts under the product, named by the tenant's own definitions.
 * An attribute with no definition is not rendered under a raw key.
 */
const visibleDetails = computed(() => props.metafieldDefinitions.flatMap((definition) => {
  const value = props.product.metafields[metafieldHandle(definition)]
  if (value === undefined || value === null) return []
  const values = Array.isArray(value) ? value : [String(value)]
  return values.length ? [{ key: definition.id, label: definition.name, values }] : []
}))

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
  offers: offer.value
    ? {
        '@type': 'Offer',
        price: minorAmountToMajor(offer.value.unit_amount, offer.value.currency),
        priceCurrency: offer.value.currency,
        availability: isAvailable.value ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
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
