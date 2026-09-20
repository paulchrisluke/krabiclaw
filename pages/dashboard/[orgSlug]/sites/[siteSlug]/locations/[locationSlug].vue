<template>
  <!--
    Settings and Messages are their own screens with their own shells, the way the
    listing editor's cog opens a separate preferences screen rather than a pane
    beside the rail. Everything else is a section of this location.
  -->
  <!--
    Nothing of this level is on screen once the open level is deeper than one of
    its sections: the two columns always belong to the open level and its
    parent. Rendering the rail anyway is what put a third column beside a
    grandchild's own pair.
  -->
  <NuxtPage v-if="panelHidden" />

  <!--
    Two columns, two panels. `UDashboardPanel` already carries the divider
    (`lg:not-last:border-e`), the scroll container and the body's padding, so
    this level states only which column it is and how wide.

    Below `lg` the open level is the whole screen and this one is simply not
    drawn: `hidden` rather than a `fixed` overlay on top of it. Overlaying left
    both columns laid out and painted at every width, and put the covered
    column's images on the wire for nothing.
  -->
  <template v-else>
    <UDashboardPanel
      id="location-hub"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar :title="location?.title || 'Location'" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="locationsPath" label="Locations" />
          </template>
          <template #right>
            <UButton
              :to="settingsPath"
              icon="i-lucide-settings"
              color="neutral"
              variant="ghost"
              square
              aria-label="Location settings"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
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

          <!--
            One card per thing a guest sees on this location's page, in the
            order the page shows it, each stating what it holds right now.
          -->
          <UPageList v-else-if="location" class="gap-3">
            <UPageCard
              v-for="card in cards"
              :key="card.id"
              :to="card.to"
              :title="card.title"
              :description="card.description"
              variant="soft"
              :highlight="card.id === activeSection"
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
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open child owns the other column, header and all. -->
    <NuxtPage v-if="hasDetail" />
  </template>
</template>

<script setup lang="ts">
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { getTodayHoursLabel, type OpeningHours } from '~/shared/reservation-hours'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import { catalogLabel, catalogSummary, type CatalogCounts } from '~/utils/product-presentation'
import { formatPostalAddress } from '~/utils/postal-address'
import type { LocationReservationConfig } from '~/server/utils/reservations'

definePageMeta({ layout: 'dashboard', ownsChrome: true })

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
const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const locationsPath = computed(() => `${sitePath.value}/locations`)
const locationPath = computed(() => `${locationsPath.value}/${String(route.params.locationSlug)}`)
// `useEditorFrame` provides and injects, so it must run while setup is still
// synchronous. Awaiting before it binds the frame to nothing: the mode never
// resolves and this level silently drops out of the chain.
const frame = useEditorFrame(locationPath)

const siteId = await useDashboardSiteId()

const locationId = computed(() => dashboardLocation.currentLocationId.value)
const settingsPath = computed(() => `${locationPath.value}/settings`)

// Settings and Messages are their own screens rather than sections of this one, so
// they leave the chain entirely rather than taking a column in it.
const STANDALONE_SECTIONS = ['settings', 'messages']
const sectionSegment = computed(() => frame.childSegment.value ?? '')
const rendersStandalone = computed(() => STANDALONE_SECTIONS.includes(sectionSegment.value))
// Whether this hub's own panel is on screen at all: a standalone section
// (settings, inbox) replaces it, and so does a deeper level that owns both
// columns. Nothing this page loads is rendered while it is true.
const panelHidden = computed(() => rendersStandalone.value || frame.mode.value === 'yield')
const hasDetail = computed(() => frame.mode.value === 'pair')
const activeSection = computed(() => sectionSegment.value || null)

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
const { data: overview, pending: overviewPending, error: overviewError, refresh } = await useAsyncData<LocationOverviewResource>(overviewKey, async () => {
  const requestedLocationId = locationId.value
  if (!requestedLocationId) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  const shouldIncludeProducts = includeProducts.value
  return await dashboardApi<LocationOverviewResource>(
    `/api/dashboard/sites/${siteId}/locations/${requestedLocationId}/overview`,
    { query: { includeProducts: String(shouldIncludeProducts) }, validate: isOverviewResponse },
  )
}, {
  lazy: true,
  // The location's own overview — its profile, its catalogue summary, its
  // inbox summary and its content counts — is what this panel draws. Opening
  // the location's settings or inbox, or a level below that owns both columns,
  // replaces the panel entirely.
  immediate: !panelHidden.value,
})

// Coming back up to this hub from a level that hid it: the component stayed
// mounted, so the read skipped above has to start now, and a read that already
// happened is re-run because settings may have changed what the cards state.
// Synchronous flush so `loading` is already true on the render that first
// shows the panel.
watch(panelHidden, (hidden) => {
  if (!hidden) refresh()
}, { flush: 'sync' })

// Loading, or not started because this panel was not on screen yet.
const loading = computed(() =>
  overviewPending.value || (!panelHidden.value && !overview.value && !overviewError.value))

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

/**
 * Where there is a pane, it opens on the first section rather than sitting
 * empty beside the rail — the listing editor does the same, sending /details to
 * /details/photo-tour, but only at the width where the pane exists. Below it
 * the rail is the whole screen and nothing is chosen for the tenant.
 *
 * Gated on the shell's own breakpoint, so the redirect and the pane can never
 * disagree about whether there is somewhere to put a section. Client-only,
 * because the server cannot know the viewport, and `replace` so Back still
 * leaves the location instead of bouncing through the hub.
 */
// Tailwind's `lg`, which is where the second panel appears and where
// every other split in the dashboard sits. Kept as one constant per hub so the
// redirect and the layout cannot disagree about whether a pane exists.
const PANE_BREAKPOINT = '(min-width: 1024px)'
let sectionChosen = false

function openFirstSectionBesideTheRail() {
  // Only from the location itself. `hasDetail` is also false when a deeper
  // level owns both columns, and opening the first section from there threw the
  // tenant out of whatever they had open.
  if (sectionChosen || loading.value || frame.mode.value !== 'index') return
  if (!window.matchMedia(PANE_BREAKPOINT).matches) return
  const first = cards.value[0]
  if (!first) return
  sectionChosen = true
  void navigateTo(first.to, { replace: true })
}

onMounted(() => {
  // Runs once now for data that arrived with the page, and again when a later
  // load settles. A `watch` with `immediate` could not do both: its first call
  // happens before its own stop handle exists.
  openFirstSectionBesideTheRail()
  watch([loading, hasDetail], openFirstSectionBesideTheRail)
})

useSeoMeta({ title: () => `${location.value?.title || 'Location'} | KrabiClaw`, robots: 'noindex, nofollow' })
</script>
