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
      <SayaButton v-if="isMenu && emptyExperienceHref" class="mt-6" :to="localePath(emptyExperienceHref)">
        {{ t('saya.nav.experiences') }}
      </SayaButton>
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
                v-if="product.image && product.available"
                :to="localePath(presentation.productPath(locationSlug(product.location_id), product.slug))"
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
                      v-if="product.available"
                      :to="localePath(presentation.productPath(locationSlug(product.location_id), product.slug))"
                      class="text-default no-underline underline-offset-2 hover:underline"
                    >
                      {{ product.name }}
                    </NuxtLink>
                    <span v-else class="text-default opacity-50">{{ product.name }}</span>
                    <SayaBadgeUnavailable
                      v-if="!product.available"
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
                  <div class="saya-dotted-leader" />
                  <div class="flex shrink-0 items-baseline gap-1.5 tabular-nums text-base text-default">
                    <span v-if="compareAtPrice(product)" class="text-sm text-muted line-through">{{ compareAtPrice(product) }}</span>
                    <span>{{ formatProductMoney(product.price) }}</span>
                  </div>
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
            <NuxtLink :to="localePath(presentation.productPath(locationSlug(product.location_id), product.slug))" class="group block text-default no-underline">
              <div class="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                <img
                  v-if="product.image?.public_url"
                  :src="product.image.public_url"
                  :alt="product.image.alt_text || product.name"
                  class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                >
                <div v-else class="flex h-full items-center justify-center" aria-hidden="true">
                  <SayaIcon name="sparkles" class="size-12 text-dimmed" />
                </div>
                <SayaBadgeUnavailable
                  v-if="!product.available"
                  overlay
                  :text="t('saya.menu_page.unavailable')"
                />
              </div>
              <div class="mt-5">
                <div class="flex items-start justify-between gap-4">
                  <h3 class="text-lg font-semibold transition-colors group-hover:text-primary">{{ product.name }}</h3>
                  <span class="shrink-0 tabular-nums">{{ formatProductMoney(product.price) }}</span>
                </div>
                <p v-if="showLocations" class="mt-1 text-xs font-medium uppercase tracking-wide text-muted">{{ locationTitle(product.location_id) }}</p>
                <p v-if="product.description" class="mt-1 line-clamp-2 text-sm leading-6 text-muted">{{ product.description }}</p>
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
import { minorAmountToMajor } from '~/shared/prices'
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
  brandName: string
  emptyExperienceHref?: string | null
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
  const seen = new Map<string, number>()
  return [...grouped].map(([category, products]) => {
    const base = slugifyCategory(category)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return { id: count === 0 ? base : `${base}-${count}`, category, products }
  })
})
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

function slugifyCategory(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

function previewItem(product: Product) {
  return {
    name: product.name,
    media: product.image ? [product.image] : [],
  }
}

function dietaryTags(product: Product): string[] {
  const notes = product.details.find(detail => detail.key === 'dietary-notes')?.values ?? []
  return notes.filter(note => note === 'V' || note === 'VG' || note === 'GF')
}

function compareAtPrice(product: Product): string | null {
  const price = product.price
  if (!price || price.compare_at_amount_minor === null) return null
  return formatProductMoney({
    ...price,
    amount_minor: price.compare_at_amount_minor,
    compare_at_amount_minor: null,
  })
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
          offers: product.price ? { '@type': 'Offer', price: minorAmountToMajor(product.price.amount_minor, product.price.currency), priceCurrency: product.price.currency } : undefined,
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
          offers: product.price ? { '@type': 'Offer', price: minorAmountToMajor(product.price.amount_minor, product.price.currency), priceCurrency: product.price.currency } : undefined,
        },
      })),
    }))
</script>
