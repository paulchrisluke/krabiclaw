<template>
  <!--
    Settings and Inbox are their own screens with their own shells, the way the
    listing editor's cog opens a separate preferences screen rather than a pane
    beside the rail. Everything else is a section of this location.
  -->
  <!--
    Nothing of this level is on screen once the open level is deeper than one of
    its sections: the two columns always belong to the open level and its
    parent. Rendering the rail anyway is what put a third column beside a
    grandchild's own pair.
  -->
  <NuxtPage v-if="rendersStandalone || frame.mode.value === 'yield'" />

  <UDashboardPanel v-else id="location-hub">
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
      <EditorPaneShell
        :has-detail="hasDetail"
        :detail-title="detailTitle"
        :dismiss-to="locationPath"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <div v-if="loading" class="space-y-4">
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

          <div v-else-if="location" class="space-y-6">
            <NuxtLink :to="`${settingsPath}/profile`" class="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <div class="overflow-hidden rounded-2xl bg-elevated transition-colors group-hover:bg-accented">
                <img
                  v-if="locationImage"
                  :src="locationImage"
                  :alt="`${location.title} preview`"
                  class="aspect-[40/21] w-full object-cover"
                >
                <div class="space-y-2 p-5">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <h1 class="min-w-0 text-lg font-semibold text-highlighted">{{ location.title }}</h1>
                    <UBadge :color="location.status === 'active' ? 'success' : 'neutral'" variant="soft" class="capitalize">
                      {{ location.status }}
                    </UBadge>
                  </div>
                  <p class="text-sm text-muted">{{ addressSummary }}</p>
                  <p class="text-sm text-muted">{{ currentOpeningState }}</p>
                </div>
              </div>
            </NuxtLink>

            <EditorNavigationList :groups="contentGroups" :active-item="activeSection" variant="cards" />
          </div>
        </template>

        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { getTodayHoursLabel, type OpeningHours } from '~/shared/reservation-hours'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard', ownsChrome: true })

interface LocationOverview {
  id: string
  title: string
  status: string
  phone: string | null
  email: string | null
  city: string | null
  address: { addressLines?: string[] } | null
  rating: number | null
  google_place_id: string | null
  timezone?: string | null
  opening_hours?: OpeningHours
}

interface InboxSummary { openThreads: number; unreadThreads: number }
interface LocationContentCounts {
  photos: number
  posts: number
  qa: number
  upcomingReservations: number
}
interface LocationOverviewResource {
  location: { success: boolean; location: LocationOverview }
  products: { success: boolean; products: ApiRecord[] }
  threads: { summary: InboxSummary }
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

// Settings and Inbox are their own screens rather than sections of this one, so
// they leave the chain entirely rather than taking a column in it.
const STANDALONE_SECTIONS = ['settings', 'inbox']
const sectionSegment = computed(() => frame.childSegment.value ?? '')
const rendersStandalone = computed(() => STANDALONE_SECTIONS.includes(sectionSegment.value))
const hasDetail = computed(() => frame.mode.value === 'pair')
const activeSection = computed(() => sectionSegment.value || null)

const location = ref<LocationOverview | null>(null)
const products = ref<ApiRecord[]>([])
const inboxSummary = ref<InboxSummary>({ openThreads: 0, unreadThreads: 0 })
const counts = ref<LocationContentCounts>({ photos: 0, posts: 0, qa: 0, upcomingReservations: 0 })
const loading = ref(true)
const error = ref<string | null>(null)

const dashboardLocationRow = computed(() => dashboard.locations.value.find(candidate => candidate.id === locationId.value) ?? null)
const locationImage = computed(() =>
  dashboardLocationRow.value?.media.find(item => item.slot === 'social_card')?.public_url ?? '')
const addressSummary = computed(() => location.value?.address?.addressLines?.join(', ') || 'Address not set')

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
  if (!hours) return 'Hours not set'
  return getTodayHoursLabel(hours, 'Closed', location.value?.timezone) || 'Hours not set'
})

function countSummary(total: number, noun: string, empty: string): string {
  if (!total) return empty
  return `${total} ${total === 1 ? noun : `${noun}s`}`
}

const contentGroups = computed(() => {
  const items = [
    { id: 'products', label: dashboard.site.value?.vertical === 'restaurant' ? 'Menu' : 'Products', summary: countSummary(products.value.length, 'item', 'Add your first item'), to: `${locationPath.value}/products`, visible: hasFeature('products') },
    { id: 'photos', label: 'Photos', summary: countSummary(counts.value.photos, 'photo', 'Add photos'), to: `${locationPath.value}/photos`, visible: hasFeature('photos') },
    { id: 'posts', label: 'Posts', summary: countSummary(counts.value.posts, 'published post', 'Write your first post'), to: `${locationPath.value}/posts`, visible: hasFeature('posts') },
    { id: 'qa', label: 'Q&A', summary: countSummary(counts.value.qa, 'question', 'Answer your first question'), to: `${locationPath.value}/qa`, visible: hasFeature('qa') },
  ].filter(item => item.visible !== false)

  const operations = [
    { id: 'reservations', label: 'Reservations', summary: countSummary(counts.value.upcomingReservations, 'upcoming booking', 'No upcoming bookings'), to: `${locationPath.value}/reservations`, visible: hasFeature('reservations') },
    { id: 'inbox', label: 'Guest activity', summary: inboxSummary.value.unreadThreads ? `${inboxSummary.value.unreadThreads} unread · ${inboxSummary.value.openThreads} open` : countSummary(inboxSummary.value.openThreads, 'open request', 'Nothing waiting'), to: `${locationPath.value}/inbox`, visible: true },
  ].filter(item => item.visible !== false)

  return [{ id: 'public-content', items }, { id: 'operations', label: 'Manage', items: operations }]
    .filter(group => group.items.length > 0)
})

const detailTitle = computed(() => {
  for (const group of contentGroups.value) {
    const match = group.items.find(item => item.id === activeSection.value)
    if (match) return match.label
  }
  return ''
})

const isOverviewResponse = (value: unknown): value is LocationOverviewResource =>
  isRecord(value)
  && isRecord(value.location) && isRecord(value.location.location)
  && isRecord(value.products) && Array.isArray(value.products.products)
  && isRecord(value.threads) && isRecord(value.threads.summary)
  && isRecord(value.counts) && typeof value.counts.photos === 'number'

const requestEvent = useRequestEvent()
const overviewKey = computed(() => `dashboard-location-overview:${siteId}:${locationId.value}:${includeProducts.value ? 'products' : 'no-products'}`)
const { data: overview, pending: overviewPending, error: overviewError } = await useAsyncData<LocationOverviewResource>(overviewKey, async () => {
  const requestedLocationId = locationId.value
  if (!requestedLocationId) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  const shouldIncludeProducts = includeProducts.value
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const { loadDashboardLocationOverview } = await import('~/server/utils/dashboard-editor-resources')
    return await loadDashboardLocationOverview(requestEvent, siteId, requestedLocationId, { includeProducts: shouldIncludeProducts }) as LocationOverviewResource
  }
  return await dashboardApi<LocationOverviewResource>(
    `/api/dashboard/sites/${siteId}/locations/${requestedLocationId}/overview`,
    { query: { includeProducts: String(shouldIncludeProducts) }, validate: isOverviewResponse },
  )
}, { lazy: import.meta.client })

watch([overview, overviewPending, overviewError], ([resource, pending, cause]) => {
  loading.value = pending
  if (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load location overview'
    return
  }
  if (!resource) return
  location.value = resource.location.location
  products.value = resource.products.products
  inboxSummary.value = resource.threads.summary
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
// Tailwind's `lg`, which is where EditorPaneShell puts the pane and where
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
  const first = contentGroups.value[0]?.items[0]
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
