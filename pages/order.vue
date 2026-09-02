<template>
  <div>
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ orderCopy.orderKicker }}</p>
      <h1 class="saya-display-md text-default"><em class="saya-italic">{{ getField('hero.title', orderCopy.orderHeroTitle) }}</em></h1>
      <p v-if="getField('hero.subtitle')" class="mt-5 max-w-xl text-sm leading-relaxed text-muted">{{ getField('hero.subtitle') }}</p>
    </header>

    <section v-if="catalogProducts.length" class="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8" aria-label="Ordering menu">
      <div class="mb-8 flex flex-col gap-4 border-y border-default py-5 sm:flex-row sm:items-end sm:justify-between">
        <div v-if="orderingLocations.length > 1" class="min-w-64">
          <label for="ordering-location" class="saya-eyebrow mb-2 block text-muted">Location</label>
          <select id="ordering-location" v-model="selectedLocationId" class="w-full border border-default bg-default px-3 py-2 text-sm text-default">
            <option v-for="location in orderingLocations" :key="location.id" :value="location.id">{{ location.title }}</option>
          </select>
        </div>
        <div class="min-w-64">
          <label for="ordering-search" class="saya-eyebrow mb-2 block text-muted">Find a dish</label>
          <input id="ordering-search" v-model.trim="search" type="search" placeholder="Search the menu" class="w-full border border-default bg-default px-3 py-2 text-sm text-default">
        </div>
      </div>

      <nav v-if="sections.length > 1" class="mb-10 flex gap-2 overflow-x-auto" aria-label="Ordering menu sections">
        <button v-for="section in sections" :key="section" type="button" class="shrink-0 rounded-full border px-4 py-2 text-sm" :class="selectedSection === section ? 'border-primary bg-primary text-inverted' : 'border-default bg-default text-default'" @click="selectedSection = section">
          {{ section }}
        </button>
      </nav>

      <div v-if="visibleProducts.length" class="grid gap-5 md:grid-cols-2">
        <article v-for="product in visibleProducts" :key="product.id" class="border border-default bg-elevated p-5">
          <div class="flex gap-4">
            <img v-if="product.image?.public_url" :src="product.image.public_url" :alt="product.image.alt_text || product.name" class="size-24 shrink-0 object-cover">
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-4">
                <h2 class="text-lg font-semibold text-default">{{ product.name }}</h2>
                <span class="shrink-0 text-sm font-semibold text-default">{{ formatProductMoney(product.price, locale) }}</span>
              </div>
              <p v-if="product.description" class="mt-2 text-sm leading-relaxed text-muted">{{ product.description }}</p>
              <p v-if="!product.available" class="mt-3 text-sm font-medium text-warning">Currently unavailable</p>
            </div>
          </div>

          <details v-if="activeModifierGroups(product).length" class="mt-5 border-t border-default pt-4">
            <summary class="cursor-pointer text-sm font-medium text-default">View options</summary>
            <div class="mt-4 space-y-4">
              <fieldset v-for="group in activeModifierGroups(product)" :key="group.id">
                <legend class="text-sm font-semibold text-default">
                  {{ group.name }} <span class="font-normal text-muted">· choose {{ selectionLabel(group.minimum_selections, group.maximum_selections) }}</span>
                </legend>
                <ul class="mt-2 space-y-2">
                  <li v-for="option in group.options.filter(item => item.is_active)" :key="option.id" class="flex justify-between gap-4 text-sm text-muted">
                    <span>{{ option.name }}</span>
                    <span v-if="option.price_delta_minor">+{{ formatMinorAmount(option.price_delta_minor, product.price?.currency ?? catalog.currency, locale) }}</span>
                  </li>
                </ul>
              </fieldset>
            </div>
          </details>
        </article>
      </div>
      <p v-else class="py-12 text-center text-sm text-muted">No dishes match this search.</p>
      <p class="mt-10 text-sm text-muted">Scan an Ordering QR at the venue to start a table order.</p>
    </section>

    <section v-else class="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div class="flex min-h-64 flex-col items-center justify-center gap-6 text-center">
        <SayaIcon name="shopping-bag" class="size-12 text-muted" />
        <div><h2 class="text-2xl font-bold text-default">{{ orderCopy.onlineOrderingNotAvailable }}</h2><p class="mt-2 text-muted">{{ orderCopy.wedLoveToSeeYou }}</p></div>
        <SayaButton v-if="orderCopy.ctaRoute && orderCopy.reserveCta" :to="orderCopy.ctaRoute" size="lg">{{ orderCopy.reserveCta }}</SayaButton>
      </div>
    </section>

    <section v-if="orderableLocations.length" class="mx-auto max-w-7xl border-t border-default px-4 py-12 sm:px-6 lg:px-8">
      <h2 class="text-lg font-semibold text-default">Delivery partners</h2>
      <div class="mt-4 flex flex-wrap gap-3">
        <a v-for="link in deliveryLinks" :key="`${link.location}-${link.label}`" :href="link.url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-4 py-2 text-sm font-medium text-default">
          {{ link.location }} · {{ link.label }} <SayaIcon name="arrow-top-right-on-square" class="size-3.5 text-muted" />
        </a>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Product } from '~/server/types/products'
import type { ModifierGroup } from '~/shared/ordering-catalog'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { formatMinorAmount } from '~/shared/prices'
import { formatProductMoney } from '~/utils/product-money'

definePageMeta({ layout: 'saya' })

interface OrderingLocation { id: string; slug: string; title: string }
interface OrderingCatalogResponse { products: Product[]; locations: OrderingLocation[]; currency: CurrencyCode }

function isOrderingCatalogResponse(value: unknown): value is OrderingCatalogResponse {
  return isRecord(value)
    && Array.isArray(value.products)
    && value.products.every(product => isRecord(product) && typeof product.id === 'string' && Array.isArray(product.modifier_groups))
    && Array.isArray(value.locations)
    && value.locations.every(location => isRecord(location) && typeof location.id === 'string' && typeof location.slug === 'string' && typeof location.title === 'string')
    && isCurrencyCode(value.currency)
}

const { isPlatform, site, siteId } = useTenantSite()
if (isPlatform || !siteId) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

const route = useRoute()
const { locale } = useI18n()
const orderCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))
const { getField, locations } = await usePublicPageData()

const catalog = await (async (): Promise<OrderingCatalogResponse> => {
  if (import.meta.server) {
    const event = useRequestEvent()
    if (!event) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const [{ cloudflareEnv }, { loadPublicOrderingCatalog }] = await Promise.all([import('~/server/utils/api-response'), import('~/server/utils/public-products')])
    const db = cloudflareEnv(event).DB
    if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
    const result = await loadPublicOrderingCatalog(db, siteId)
    if (!result) throw createError({ statusCode: 404, statusMessage: 'Ordering catalog not found' })
    return { products: result.products, locations: result.locations.map(({ id, slug, title }) => ({ id, slug, title })), currency: result.currency }
  }
  const response = await fetch(`/api/public/sites/${encodeURIComponent(siteId)}/ordering-catalog`)
  const payload: unknown = await response.json()
  if (!response.ok || !isOrderingCatalogResponse(payload)) throw createError({ statusCode: response.status || 502, statusMessage: 'Invalid ordering catalog response' })
  return payload
})()

const queryLocation = typeof route.query.location === 'string' ? route.query.location : null
const orderingLocations = catalog.locations.filter(location => catalog.products.some(product => product.location_id === location.id))
const selectedLocationId = ref(orderingLocations.find(location => location.slug === queryLocation)?.id ?? orderingLocations[0]?.id ?? '')
const search = ref('')
const selectedSection = ref('All')
const catalogProducts = computed(() => catalog.products.filter(product => product.location_id === selectedLocationId.value))
const sections = computed(() => ['All', ...new Set(catalogProducts.value.map(product => product.menu_placement?.section ?? product.category))])
const visibleProducts = computed(() => {
  const needle = search.value.toLocaleLowerCase(locale.value)
  return catalogProducts.value.filter((product) => {
    const section = product.menu_placement?.section ?? product.category
    return (selectedSection.value === 'All' || selectedSection.value === section)
      && (!needle || `${product.name} ${product.description} ${section}`.toLocaleLowerCase(locale.value).includes(needle))
  })
})
watch(selectedLocationId, () => { selectedSection.value = 'All' })

const activeModifierGroups = (product: Product): ModifierGroup[] => product.modifier_groups.filter(group => group.is_active)
const selectionLabel = (minimum: number, maximum: number): string => minimum === maximum ? String(minimum) : `${minimum}–${maximum}`
const platformLinks = (location: typeof locations.value[number]) => [
  { label: orderCopy.value.grabLabel, url: location.grab_url },
  { label: orderCopy.value.uberEatsLabel, url: location.uber_eats_url },
  { label: orderCopy.value.foodpandaLabel, url: location.foodpanda_url },
].filter((link): link is { label: string; url: string } => typeof link.url === 'string' && Boolean(link.url))
const orderableLocations = computed(() => locations.value.filter(location => platformLinks(location).length))
const deliveryLinks = computed(() => orderableLocations.value.flatMap(location => platformLinks(location).map(link => ({ ...link, location: location.title }))))

useSocialMetadata(() => ({ path: '/order', title: `Order | ${site?.brand_name?.trim() ?? ''}`, description: orderCopy.value.seoOrderDescription(site?.brand_name?.trim() ?? ''), brand: { siteName: site?.brand_name?.trim() ?? '' } }))
</script>
