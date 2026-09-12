<template>
  <div class="min-h-screen bg-default text-default">
    <template v-if="isMenu">
      <SayaSubNav
        v-if="currentLocation"
        :location-slug="currentLocation.slug"
        active="menu"
      />

      <header class="mx-auto max-w-7xl px-4 pb-10 pt-12 text-center sm:px-6 lg:px-8">
        <NuxtLink
          v-if="currentLocation"
          :to="localePath(`/locations/${encodeURIComponent(currentLocation.slug)}`)"
          class="saya-kicker mb-8 inline-block text-muted no-underline hover:text-default"
        >
          ← {{ t('saya.location.back_to', { title: currentLocation.title }) }}
        </NuxtLink>
        <p v-else-if="collectionLabel" class="saya-kicker mb-4">{{ collectionLabel }}</p>
        <div class="flex flex-col gap-2">
          <h1 class="saya-display-md text-default">{{ currentLocation?.title ?? brandName }}</h1>
          <p v-if="currentLocation && menuUpdated" class="text-sm text-muted">
            {{ t('saya.menu_page.updated', { date: menuUpdated }) }}
          </p>
        </div>
        <div v-if="locations.length > 1 && !locationId" class="mt-8 flex flex-wrap justify-center gap-3">
          <NuxtLink
            v-for="location in locations"
            :key="location.id"
            :to="localePath(productLocationCollectionPath(vertical, location.slug))"
            class="inline-flex items-center gap-2 rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
          >
            <SayaIcon name="map-pin" class="size-3.5 opacity-70" />
            {{ location.title }}
          </NuxtLink>
        </div>
      </header>
    </template>

    <header v-else class="mx-auto max-w-7xl px-4 pb-10 pt-12 text-center sm:px-6 lg:px-8">
      <p v-if="collectionLabel" class="saya-kicker mb-4">{{ collectionLabel }}</p>
      <h1 class="saya-display-md text-default">{{ title }}</h1>
      <div v-if="locations.length > 1 && !locationId" class="mt-8 flex flex-wrap justify-center gap-3">
        <NuxtLink
          v-for="location in locations"
          :key="location.id"
          :to="localePath(productLocationCollectionPath(vertical, location.slug))"
          class="inline-flex items-center gap-2 rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
        >
          <SayaIcon name="map-pin" class="size-3.5 opacity-70" />
          {{ location.title }}
        </NuxtLink>
      </div>
    </header>

    <div v-if="products.length === 0 && (isMenu || emptyCollectionMessage)" class="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p v-if="currentLocation && isMenu || emptyCollectionMessage" class="saya-display saya-italic text-3xl">
        {{ currentLocation && isMenu ? t('saya.menu_page.coming_soon_title') : emptyCollectionMessage }}
      </p>
      <p v-if="currentLocation && isMenu" class="mt-4 text-sm text-muted">
        {{ t('saya.menu_page.coming_soon_desc', { location: currentLocation.title }) }}
      </p>
    </div>

    <div v-else-if="isMenu">
      <SayaFilterTabs
        v-model="activeCategory"
        :tabs="categoryTabs"
        :enable-scroll-detection="true"
        @height="categoryNavHeight = $event"
      />

      <div class="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <section
          v-for="group in groups"
          :id="`cat-${group.id}`"
          :key="group.category"
          class="mb-24"
          :style="{ scrollMarginTop: `${categoryNavHeight}px` }"
        >
          <div class="mb-8 border-b border-default pb-6">
            <h2 class="saya-display saya-italic text-5xl text-default">{{ group.category }}</h2>
          </div>

          <div class="flex flex-col gap-7">
            <article
              v-for="product in group.products"
              :key="product.id"
              class="flex items-start gap-5"
            >
              <NuxtLink
                v-if="product.image && isAvailable(product, group.location_id) && productHref(product, group.location_id)"
                :to="productHref(product, group.location_id)!"
                class="shrink-0"
              >
                <SayaMenuItemPreview :item="previewItem(product)" />
              </NuxtLink>
              <SayaMenuItemPreview
                v-else-if="product.image"
                :item="previewItem(product)"
                disabled
              />

              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                  <div class="flex items-baseline gap-2 text-base font-medium text-default">
                    <NuxtLink
                      v-if="isAvailable(product, group.location_id) && productHref(product, group.location_id)"
                      :to="productHref(product, group.location_id)!"
                      class="text-default no-underline underline-offset-2 hover:underline"
                    >
                      {{ product.name }}
                    </NuxtLink>
                    <span v-else class="text-default opacity-50">{{ product.name }}</span>
                    <SayaBadgeUnavailable
                      v-if="!isAvailable(product, group.location_id)"
                      :text="t('saya.menu_page.unavailable')"
                    />
                    <span
                      v-for="tag in dietaryTags(product)"
                      :key="tag"
                      class="inline-flex shrink-0 items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-muted"
                    >
                      {{ tag }}
                    </span>
                  </div>
                  <template v-if="priceLabel(product, group.location_id)">
                    <div class="saya-dotted-leader" />
                    <div class="flex shrink-0 items-baseline gap-1.5 tabular-nums text-base text-default">
                      <span v-if="compareAtPrice(product, group.location_id)" class="text-sm text-muted line-through">{{ compareAtPrice(product, group.location_id) }}</span>
                      <span>{{ priceLabel(product, group.location_id) }}</span>
                    </div>
                  </template>
                </div>
                <p v-if="product.description" class="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                  {{ product.description }}
                </p>
              </div>
            </article>
          </div>
        </section>

        <section class="border-t border-default pt-12">
          <p class="saya-kicker mb-4">{{ t('saya.menu_page.allergens_title') }}</p>
          <p class="text-sm leading-relaxed text-muted">
            {{ t('saya.menu_page.allergens_desc') }}
          </p>
        </section>
      </div>
    </div>

    <div v-else class="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <section v-for="group in groups" :key="group.category" class="mb-20">
        <h2 class="saya-display saya-italic mb-8 border-b border-default pb-6 text-5xl">{{ group.category }}</h2>
        <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="product in group.products" :key="product.id">
            <component :is="productHref(product, group.location_id) ? NuxtLinkComponent : 'div'" :to="productHref(product, group.location_id) ?? undefined" class="group block text-default no-underline">
              <div v-if="product.image?.public_url" class="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                <img
                  :src="product.image.public_url"
                  :alt="product.image.alt_text || product.name"
                  class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                >
                <SayaBadgeUnavailable
                  v-if="!isAvailable(product, group.location_id)"
                  overlay
                  :text="t('saya.menu_page.unavailable')"
                />
              </div>
              <div class="mt-5">
                <div class="flex items-start justify-between gap-4">
                  <h3 class="text-lg font-semibold transition-colors group-hover:text-primary">{{ product.name }}</h3>
                  <span v-if="priceLabel(product, group.location_id)" class="shrink-0 tabular-nums">{{ priceLabel(product, group.location_id) }}</span>
                </div>
                <p v-if="showLocations && productLocationId(product, group.location_id)" class="mt-1 text-xs font-medium uppercase tracking-wide text-muted">{{ locationTitle(productLocationId(product, group.location_id)!) }}</p>
                <p v-if="product.description" class="mt-1 line-clamp-2 text-sm leading-6 text-muted">{{ product.description }}</p>
              </div>
            </component>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Collection, Product, ProductPresentation } from '~/server/types/products'
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import type { CurrencyCode } from '~/shared/currencies'
import { formatProductMoney } from '~/utils/product-money'
import { minorAmountToMajor, selectPrice, type Price } from '~/shared/prices'
import { PRICING_NOTE_HANDLE } from '~/shared/metafields'
import { groupProductsByCollection, productLocationCollectionPath } from '~/utils/product-presentation'

interface LocationSummary { id: string; slug: string; title: string }

// Resolved once: a dynamic `:is` given the string 'NuxtLink' renders a literal
// <NuxtLink> element that no browser follows, so the card looked linked in the
// markup and was not.
const NuxtLinkComponent = resolveComponent('NuxtLink')

const props = defineProps<{
  products: Product[]
  collections: Collection[]
  locations: LocationSummary[]
  locationId?: string | null
  currency: CurrencyCode
  presentation: ProductPresentation
  vertical: string
  title: string
  brandName: string
}>()

const { localePath, t } = useI18n()
const { formatDate } = useLocaleDate()
const isMenu = computed(() => props.presentation.structuredDataType === 'MenuItem')
const collectionLabel = computed(() => isMenu.value
  ? t('saya.footer.menu')
  : t('saya.footer.products'))
const emptyCollectionMessage = computed(() => t('saya.products.empty'))
const locationMap = computed(() => new Map(props.locations.map(location => [location.id, location])))
const showLocations = computed(() => !props.locationId && props.locations.length > 1)
const currentLocation = computed(() => {
  if (!props.locationId) return null
  const location = locationMap.value.get(props.locationId)
  if (!location) throw new Error(`Product location is missing: ${props.locationId}`)
  return location
})
/**
 * Where a product's page lives.
 *
 * The page is scoped to one location when the route says so; otherwise the
 * product must be offered at exactly one of this site's locations for its
 * route to be unambiguous. Several, and there is no single path — the product
 * is linked from each location's own collection instead.
 */
const productLocationId = (product: Product, collectionLocationId: string | null = null): string | null => {
  if (props.locationId) return props.locationId
  // A location's collection is that branch's menu, so a dish offered at two
  // branches is linked, priced and labelled as the branch whose section it is
  // being read in. Only under a site-wide collection is there nothing to say
  // which branch it belongs to, and then it has no single route.
  if (collectionLocationId && locationMap.value.has(collectionLocationId)
    && product.locations.some(entry => entry.location_id === collectionLocationId && entry.published)) return collectionLocationId
  const here = product.locations.filter(entry => entry.published && locationMap.value.has(entry.location_id))
  return here.length === 1 ? here[0]!.location_id : null
}
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
/**
 * Whether a customer can buy this here.
 *
 * Three separate facts, all of which must hold: the merchant is selling it,
 * this location offers it, and it has an applicable price. None of them
 * substitutes for another, and none of them is a stock statement.
 */
const isAvailable = (product: Product, collectionLocationId: string | null = null): boolean => {
  if (!product.active) return false
  const id = productLocationId(product, collectionLocationId)
  // Under a site-wide collection a product offered at several branches has no
  // single one to name, and the question becomes whether any branch this page
  // covers offers it. Skipping the check entirely there made a product offered
  // nowhere read as available.
  const offeredHere = id
    ? product.locations.some(entry => entry.location_id === id && entry.active)
    : product.locations.some(entry => entry.active && entry.published && locationMap.value.has(entry.location_id))
  if (!offeredHere) return false
  // On sale means the merchant is selling it here. A product priced in words —
  // "Market price" — is on sale; an amount is what online checkout needs, and
  // that is a different question.
  return priceFor(product, collectionLocationId) !== null
    || typeof product.metafields[PRICING_NOTE_HANDLE] === 'string'
}

const productHref = (product: Product, collectionLocationId: string | null = null): string | null => {
  const id = productLocationId(product, collectionLocationId)
  return id ? localePath(props.presentation.productPath(locationSlug(id), product.slug)) : null
}

/**
 * The offer this page shows, resolved once through the one selection contract.
 *
 * A product with several variants shows its lowest applicable offer as a
 * "from" price — an explicit choice made here, not a fallback: every variant's
 * own price is on the product's own page.
 */
const priceFor = (product: Product, collectionLocationId: string | null = null): Price | null => {
  const selection = { currency: props.currency, location_id: productLocationId(product, collectionLocationId), at: new Date().toISOString() }
  // Only variants a customer can choose: a disabled variant's price would
  // otherwise undercut the one actually on offer.
  const offers = product.variants.filter(variant => variant.active !== false).flatMap(variant => selectPrice(variant.prices, selection) ?? [])
  return offers.reduce<Price | null>((lowest, offer) => (!lowest || offer.unit_amount < lowest.unit_amount ? offer : lowest), null)
}
/**
 * What this card says about price.
 *
 * An amount when the product has one, the merchant's own words when it is
 * priced in words instead, and nothing at all when it states neither. A
 * missing amount never becomes zero, "Free" or "Market price" here.
 */
const priceLabel = (product: Product, collectionLocationId: string | null = null): string | null => {
  const amount = formatProductMoney(priceFor(product, collectionLocationId))
  if (amount) return amount
  const note = product.metafields[PRICING_NOTE_HANDLE]
  return typeof note === 'string' && note.trim() ? note : null
}
// One section per collection, in the merchant's order — see
// groupProductsByCollection for what membership does and does not imply.
const groups = computed(() => groupProductsByCollection(props.products, props.collections)
  .map(group => ({ id: group.id, category: group.name, sort_order: group.sort_order, location_id: group.location_id, products: group.products })))
const categoryTabs = computed(() => groups.value.map(group => ({
  key: group.id,
  label: group.category,
  sectionId: `cat-${group.id}`,
})))
const userSelectedCategory = ref('')
const activeCategory = computed({
  get: () => userSelectedCategory.value || groups.value[0]?.id || '',
  set: (value: string) => {
    userSelectedCategory.value = value
  },
})
const categoryNavHeight = ref(44)
const menuUpdated = computed<string | null>(() => {
  const latest = props.products.reduce<string | null>((current, product) => {
    if (!current || product.updated_at > current) return product.updated_at
    return current
  }, null)
  return latest ? formatDate(latest) : null
})

watch(groups, () => {
  userSelectedCategory.value = ''
})

function previewItem(product: Product) {
  return {
    name: product.name,
    media: product.image ? [product.image] : [],
  }
}

/**
 * Dietary marks come from the tenant's own 'menu.dietary-notes' attribute.
 * A site that has not defined it shows none, rather than a guess.
 */
function dietaryTags(product: Product): string[] {
  const notes = product.metafields['menu.dietary-notes']
  if (!Array.isArray(notes)) return []
  return notes.filter(note => note === 'V' || note === 'VG' || note === 'GF')
}

function compareAtPrice(product: Product, collectionLocationId: string | null = null): string | null {
  const price = priceFor(product, collectionLocationId)
  if (!price || price.compare_at_unit_amount === null) return null
  return formatProductMoney({ ...price, unit_amount: price.compare_at_unit_amount, compare_at_unit_amount: null })
}

function offerFor(product: Product, collectionLocationId: string | null = null) {
  const price = priceFor(product, collectionLocationId)
  return price ? { '@type': 'Offer', price: minorAmountToMajor(price.unit_amount, price.currency), priceCurrency: price.currency } : undefined
}

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
          // The same branch the card is priced for: a menu section belongs to
          // one location, and structured data that disagreed with the visible
          // price would be the page contradicting itself.
          offers: offerFor(product, group.location_id),
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
          offers: offerFor(product),
        },
      })),
    }))
</script>
