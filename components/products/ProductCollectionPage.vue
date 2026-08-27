<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pb-10 pt-12 text-center sm:px-6 lg:px-8">
      <p class="saya-kicker mb-4">{{ presentation.collectionLabel }}</p>
      <h1 class="saya-display-md text-default">{{ title }}</h1>
      <div v-if="locations.length > 1 && !locationId" class="mt-8 flex flex-wrap justify-center gap-3">
        <NuxtLink
          v-for="location in locations"
          :key="location.id"
          :to="productLocationCollectionPath(vertical, location.slug)"
          class="rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
        >
          {{ location.title }}
        </NuxtLink>
      </div>
    </header>

    <div v-if="products.length === 0" class="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p class="saya-display saya-italic text-3xl">No {{ presentation.collectionLabel.toLowerCase() }} published.</p>
    </div>

    <div v-else class="mx-auto max-w-4xl px-4 pb-24 sm:px-6 lg:px-8">
      <section v-for="group in groups" :key="group.category" class="mb-20">
        <h2 class="saya-display saya-italic mb-8 border-b border-default pb-6 text-5xl">{{ group.category }}</h2>
        <div class="grid gap-7 sm:grid-cols-2">
          <article v-for="product in group.products" :key="product.id" class="overflow-hidden rounded-2xl border border-default bg-default">
            <NuxtLink :to="presentation.productPath(locationSlug(product.location_id), product.slug)" class="block text-default no-underline">
              <img
                v-if="product.image?.public_url"
                :src="product.image.public_url"
                :alt="product.image.alt_text || product.name"
                class="aspect-[4/3] w-full object-cover"
              >
              <div class="p-5">
                <div class="flex items-start justify-between gap-4">
                  <h3 class="text-lg font-semibold">{{ product.name }}</h3>
                  <span class="shrink-0 tabular-nums">{{ formatProductMoney(product.price_amount, currency) }}</span>
                </div>
                <p v-if="showLocations" class="mt-1 text-xs font-medium uppercase tracking-wide text-muted">{{ locationTitle(product.location_id) }}</p>
                <p v-if="product.description" class="mt-3 text-sm leading-6 text-muted">{{ product.description }}</p>
                <p v-if="!product.available" class="mt-4 text-sm font-medium text-muted">Unavailable</p>
              </div>
            </NuxtLink>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Product, ProductPresentation } from '~/server/types/products'
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import type { CurrencyCode } from '~/shared/currencies'
import { formatProductMoney } from '~/utils/product-money'
import { productLocationCollectionPath } from '~/utils/product-presentation'

interface LocationSummary { id: string; slug: string; title: string }

const props = defineProps<{
  products: Product[]
  locations: LocationSummary[]
  locationId?: string | null
  currency: CurrencyCode
  presentation: ProductPresentation
  vertical: string
  title: string
}>()

const locationMap = computed(() => new Map(props.locations.map(location => [location.id, location])))
const showLocations = computed(() => !props.locationId && props.locations.length > 1)
const locationSlug = (id: string) => {
  const location = locationMap.value.get(id)
  if (!location) throw new Error(`Product location is missing: ${id}`)
  return location.slug
}
const locationTitle = (id: string) => {
  const location = locationMap.value.get(id)
  if (!location) throw new Error(`Product location is missing: ${id}`)
  return location.title
}
const groups = computed(() => {
  const grouped = new Map<string, Product[]>()
  for (const product of props.products) {
    const products = grouped.get(product.category) ?? []
    products.push(product)
    grouped.set(product.category, products)
  }
  return [...grouped].map(([category, products]) => ({ category, products }))
})

useSchemaOrg(computed(() => props.presentation.structuredDataType === 'MenuItem'
  ? {
      '@type': 'Menu',
      name: props.title,
      hasMenuSection: groups.value.map(group => ({
        '@type': 'MenuSection',
        name: group.category,
        hasMenuItem: group.products.map(product => ({
          '@type': 'MenuItem',
          name: product.name,
          description: product.description,
          offers: { '@type': 'Offer', price: product.price_amount, priceCurrency: props.currency },
        })),
      })),
    }
  : {
      '@type': 'ItemList',
      name: props.title,
      itemListElement: props.products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          name: product.name,
          description: product.description,
          offers: { '@type': 'Offer', price: product.price_amount, priceCurrency: props.currency },
        },
      })),
    }))
</script>
