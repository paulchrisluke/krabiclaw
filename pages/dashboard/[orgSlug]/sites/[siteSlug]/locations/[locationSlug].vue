<template>
  <!--
    The location: one card per thing a guest sees on its page, in the order the
    page shows it, each stating what it holds now. Every card is a level below
    this one; the gear opens the settings that a guest never sees.
  -->
  <DashboardIndexPanel id="location-hub" :title="location?.title || 'Location'" :auto-open="cards[0]?.to ?? null">
    <template #right>
      <UButton
        :to="`${level.path.value}/settings`"
        icon="i-lucide-settings"
        color="neutral"
        variant="ghost"
        square
        aria-label="Location settings"
      />
    </template>

    <div v-if="loading && !location" class="space-y-4">
      <USkeleton class="aspect-[40/21] w-full rounded-2xl" />
      <USkeleton v-for="index in 5" :key="index" class="h-20 rounded-2xl" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :description="error"
    />

    <UPageList v-else-if="location" class="gap-3">
      <UPageCard
        v-for="card in cards"
        :key="card.id"
        :to="card.to"
        :title="card.title"
        :description="card.description"
        variant="soft"
        :highlight="card.id === level.child.value"
        :ui="{ container: 'p-5 sm:p-5', title: 'text-[15px]', description: 'mt-1 line-clamp-2' }"
      >
        <img
          v-if="card.image"
          :src="card.image"
          alt=""
          class="aspect-[40/21] w-full rounded-xl object-cover"
        >
      </UPageCard>
    </UPageList>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { getTodayHoursLabel, type OpeningHours } from '~/shared/reservation-hours'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import { catalogLabel, catalogSummary, type CatalogCounts } from '~/utils/product-presentation'
import { formatPostalAddress } from '~/utils/postal-address'
import type { LocationReservationConfig } from '~/server/utils/reservations'

// A location is a tile on the Locations tab, which is where Back goes.
definePageMeta({ layout: 'dashboard', back: 'dashboard-orgSlug-sites' })

interface LocationOverview {
  id: string
  title: string
  status: string
  short_description: string | null
  description: string | null
  phone: string | null
  email: string | null
  address: PostalAddress | null
  rating: number | null
  google_place_id: string | null
  timezone?: string | null
  opening_hours?: OpeningHours
}

interface LocationContentCounts {
  photos: number
  posts: number
  qa: number
  reviews: number
  siteQa: number
}
interface LocationOverviewResource {
  location: { success: boolean; location: LocationOverview }
  catalog: CatalogCounts
  reservationConfig: LocationReservationConfig | null
  counts: LocationContentCounts
}

const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
// The level runs while setup is still synchronous: it injects the record the
// `<RouterView>` above rendered, and an `await` before it would bind nothing.
const level = useRouteLevel()
const locationPath = level.path

const siteId = await useDashboardSiteId()

const locationId = computed(() => dashboardLocation.currentLocationId.value)

const location = ref<LocationOverview | null>(null)
const catalog = ref<CatalogCounts>({ total: 0, experiences: 0 })
const reservationConfig = ref<LocationReservationConfig | null>(null)
const counts = ref<LocationContentCounts>({ photos: 0, posts: 0, qa: 0, reviews: 0, siteQa: 0 })
const error = ref<string | null>(null)

const dashboardLocationRow = computed(() => dashboard.locations.value.find(candidate => candidate.id === locationId.value) ?? null)
const locationImage = computed(() =>
  dashboardLocationRow.value?.media.find(item => item.slot === 'social_card')?.public_url ?? '')
const addressSummary = computed(() => formatPostalAddress(location.value?.address ?? null) || 'Add the address')

const capabilities = computed(() => {
  const vertical = dashboard.site.value?.vertical
  if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
  // Deliberately unguarded: swallowing a capability error left the hub with an
  // empty feature set, which removes every content and reservation row and
  // leaves a location that looks like it holds nothing.
  return resolveCmsCapabilities(normalizeVertical(vertical) as SiteVertical, resolvePublicTemplate({ themeId: dashboard.site.value?.theme_id, vertical }).slug, {
    site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides),
    location: parseCmsFeatureOverrideDelta(dashboardLocationRow.value?.feature_overrides),
  })
})
const featureSet = computed(() => new Set<ProductFeature>([
  ...(capabilities.value?.pages.map(page => page.feature) ?? []),
  ...(capabilities.value?.managers.map(manager => manager.id) ?? []),
]))
const hasFeature = (feature: ProductFeature) => featureSet.value.has(feature)
const includeProducts = computed(() => hasFeature('products'))

const currentOpeningState = computed(() => {
  const hours = location.value?.opening_hours
  if (!hours) return 'Set your hours'
  return getTodayHoursLabel(hours, 'Closed today', location.value?.timezone) || 'Set your hours'
})

// What this branch's catalogue is called: a studio's classes are experiences, a
// restaurant's dishes are its menu, and a restaurant that also takes bookings
// holds both — which is a catalog, not a menu with experiences filed inside it.
const catalogLabelText = computed(() => catalogLabel(dashboard.site.value?.vertical, catalog.value))
// One count per surface, each in its own words: "24 dishes · 3 experiences".
// Plurals are each presentation's own ("Dish" → "Dishes"); appending an "s" is
// how "dishs" reaches a merchant's screen.
const catalogSummaryText = computed(() => catalogSummary(dashboard.site.value?.vertical, catalog.value))

function countSummary(total: number, noun: string, empty: string): string {
  if (!total) return empty
  return `${total} ${total === 1 ? noun : `${noun}s`}`
}

/** "5 questions · 18 reviews · 110 site-wide", or what to do when there are none. */
function trustSummary(qa: number, reviews: number, siteQa: number): string {
  const parts = [
    qa ? countSummary(qa, 'question', '') : '',
    reviews ? countSummary(reviews, 'review', '') : '',
    siteQa ? `${siteQa} site-wide` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Answer your first question'
}

interface HubCard { id: string; title: string; description: string; to: string; image?: string }

const cards = computed<HubCard[]>(() => {
  const loc = location.value
  if (!loc) return []
  const contact = [loc.phone, loc.email].filter((value): value is string => Boolean(value?.trim())).join(' · ')
  const policy = reservationConfig.value
  return [
    { id: 'photos', title: 'Photos', description: countSummary(counts.value.photos, 'photo', 'Add photos'), to: `${locationPath.value}/photos`, image: locationImage.value || undefined, visible: hasFeature('photos') },
    { id: 'name', title: 'Name', description: loc.title, to: `${locationPath.value}/name`, visible: true },
    { id: 'description', title: 'Description', description: loc.short_description?.trim() || loc.description?.trim() || 'Describe this location', to: `${locationPath.value}/description`, visible: true },
    { id: 'hours', title: 'Hours', description: currentOpeningState.value, to: `${locationPath.value}/hours`, visible: true },
    { id: 'address', title: 'Address', description: addressSummary.value, to: `${locationPath.value}/address`, visible: true },
    { id: 'contact', title: 'Contact', description: contact || 'Add a phone or email', to: `${locationPath.value}/contact`, visible: true },
    // Built only when this site carries a catalogue at all: a vertical with no
    // product presentation has no word for one, and asking for it throws.
    ...(hasFeature('products')
      ? [{ id: 'products', title: catalogLabelText.value, description: catalogSummaryText.value, to: `${locationPath.value}/products`, visible: true }]
      : []),
    { id: 'posts', title: 'Posts', description: countSummary(counts.value.posts, 'published post', 'Write your first post'), to: `${locationPath.value}/posts`, visible: hasFeature('posts') },
    { id: 'qa', title: 'Reviews and Q&A', description: trustSummary(counts.value.qa, counts.value.reviews, counts.value.siteQa), to: `${locationPath.value}/qa`, visible: hasFeature('qa') },
    {
      id: 'reservations',
      title: 'Reservations',
      description: !policy ? 'Not taking reservations' : policy.slot_capacity === null ? 'Open, no seat limit' : `Open, ${policy.slot_capacity} guests per slot`,
      to: `${locationPath.value}/reservations`,
      visible: hasFeature('reservations'),
    },
  ].filter(card => card.visible).map(({ visible: _visible, ...card }) => card)
})

const isOverviewResponse = (value: unknown): value is LocationOverviewResource =>
  isRecord(value)
  && isRecord(value.location) && isRecord(value.location.location)
  && isRecord(value.catalog) && typeof value.catalog.total === 'number' && typeof value.catalog.experiences === 'number'
  && (value.reservationConfig === null || isRecord(value.reservationConfig))
  && isRecord(value.counts) && typeof value.counts.photos === 'number'

const overviewKey = computed(() => `dashboard-location-overview:${siteId}:${locationId.value}`)
const { data: overview, pending: overviewPending, error: overviewError } = await useAsyncData<LocationOverviewResource>(overviewKey, async () => {
  const requestedLocationId = locationId.value
  if (!requestedLocationId) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  const shouldIncludeProducts = includeProducts.value
  return await dashboardApi<LocationOverviewResource>(
    `/api/dashboard/sites/${siteId}/locations/${requestedLocationId}/overview`,
    { query: { includeProducts: String(shouldIncludeProducts) }, validate: isOverviewResponse },
  )
}, {
  lazy: true,
})

const loading = computed(() => overviewPending.value || (!overview.value && !overviewError.value))

watch([overview, overviewError], ([resource, cause]) => {
  if (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load location overview'
    return
  }
  if (!resource) return
  location.value = resource.location.location
  catalog.value = resource.catalog
  reservationConfig.value = resource.reservationConfig
  counts.value = resource.counts
  error.value = null
}, { immediate: true })


useSeoMeta({ title: () => `${location.value?.title || 'Location'} | KrabiClaw`, robots: 'noindex, nofollow' })
</script>
