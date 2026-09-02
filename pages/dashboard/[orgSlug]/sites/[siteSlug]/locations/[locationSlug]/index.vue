<template>
  <UDashboardPanel id="location-overview">
    <template #header>
      <UDashboardNavbar :title="location?.title || 'Location'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :detail-to="sitePath" detail-label="Site overview" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UPage>
        <UPageBody>
          <div class="mx-auto w-full max-w-[var(--ws-page-narrow,45rem)] pb-20">
            <div v-if="loading" class="space-y-5">
              <USkeleton class="aspect-[16/9] w-full rounded-2xl" />
              <USkeleton v-for="index in 3" :key="index" class="h-44 rounded-2xl" />
            </div>

            <UAlert
              v-else-if="error"
              color="error"
              variant="soft"
              icon="i-lucide-triangle-alert"
              :description="error"
            />

            <div v-else-if="location" class="space-y-8">
              <div class="flex items-center gap-2.5">
                <UTabs
                  v-model="activeTab"
                  :items="tabs"
                  :content="false"
                  variant="pill"
                  class="min-w-0 flex-1"
                  :ui="{ list: 'w-full', trigger: 'min-h-11 flex-1' }"
                />
                <UButton
                  v-if="settingsPath"
                  :to="settingsPath"
                  icon="i-lucide-settings"
                  color="neutral"
                  variant="ghost"
                  square
                  class="min-h-11 min-w-11"
                  aria-label="Location settings"
                />
              </div>

              <div v-if="activeTab === 'location'" class="space-y-4">
                <NuxtLink v-if="settingsPath" :to="`${settingsPath}/profile`" class="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  <UCard
                    variant="subtle"
                    class="overflow-hidden rounded-2xl transition-colors group-hover:bg-elevated"
                    :ui="{ body: 'p-0! sm:p-0!' }"
                  >
                    <img
                      v-if="locationImage"
                      :src="locationImage"
                      :alt="`${location.title} preview`"
                      class="aspect-[16/9] w-full object-cover"
                    />
                    <div class="space-y-3 px-5 py-5 sm:px-6">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                          <h1 class="text-xl font-semibold text-highlighted">{{ location.title }}</h1>
                          <p class="mt-1 text-sm text-muted">{{ addressSummary }}</p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <UBadge :color="location.status === 'active' ? 'success' : 'neutral'" variant="soft" class="capitalize">
                            {{ location.status }}
                          </UBadge>
                          <UBadge v-if="location.is_primary" color="primary" variant="soft">Primary</UBadge>
                        </div>
                      </div>
                      <p class="text-sm text-muted">{{ locationStatusSummary }}</p>
                    </div>
                  </UCard>
                </NuxtLink>

                <NuxtLink :to="`${locationPath}/inbox`" class="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  <UCard variant="subtle" class="rounded-2xl transition-colors group-hover:bg-elevated">
                    <div class="flex items-center justify-between gap-5">
                      <div class="min-w-0">
                        <h2 class="font-semibold text-highlighted">Guest activity</h2>
                        <p class="mt-1 text-sm text-muted">{{ inboxSummary.unreadThreads }} unread · {{ inboxSummary.openThreads }} open requests</p>
                      </div>
                      <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
                    </div>
                  </UCard>
                </NuxtLink>

                <NuxtLink v-if="settingsPath" :to="`${settingsPath}/hours`" class="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  <UCard variant="subtle" class="rounded-2xl transition-colors group-hover:bg-elevated">
                    <div class="flex items-center justify-between gap-5">
                      <div class="min-w-0">
                        <h2 class="font-semibold text-highlighted">Hours</h2>
                        <p class="mt-1 text-sm text-muted">{{ currentOpeningState }}</p>
                      </div>
                      <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
                    </div>
                  </UCard>
                </NuxtLink>

                <NuxtLink v-if="settingsPath" :to="`${settingsPath}/discovery`" class="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  <UCard variant="subtle" class="rounded-2xl transition-colors group-hover:bg-elevated">
                    <div class="flex items-center justify-between gap-5">
                      <div class="min-w-0">
                        <h2 class="font-semibold text-highlighted">Discovery</h2>
                        <p class="mt-1 text-sm text-muted">{{ location.google_place_id ? 'Google Places connected' : 'Google Places not connected' }}</p>
                      </div>
                      <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
                    </div>
                  </UCard>
                </NuxtLink>
              </div>

              <section
                v-else
                aria-label="Location content managers"
                class="divide-y divide-default border-y border-default"
              >
                <NuxtLink
                  v-for="item in locationManagerItems"
                  :key="item.manager.key"
                  :to="item.to"
                  :data-testid="`manager-preview-${item.manager.id}`"
                  class="group block px-1 py-6 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                >
                  <template v-if="item.manager.id === 'photos'">
                    <div class="grid gap-4 sm:grid-cols-[minmax(0,1.15fr)_minmax(10rem,0.85fr)] sm:items-center">
                      <img
                        v-if="locationImage"
                        :src="locationImage"
                        alt=""
                        class="aspect-[16/10] w-full rounded-2xl object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <div v-else class="flex aspect-[16/10] w-full items-center justify-center rounded-2xl bg-muted text-dimmed">
                        <UIcon name="i-lucide-image-off" class="size-7" />
                      </div>
                      <div>
                        <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                        <p class="mt-2 text-sm leading-6 text-muted">{{ locationImage ? 'Current location image' : 'No location image yet' }}</p>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="item.manager.id === 'products'">
                    <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                      <div>
                        <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                        <p data-testid="manager-preview-product-count" class="mt-1 text-sm text-muted">
                          {{ products.length }} {{ products.length === 1 ? 'item' : 'items' }}
                        </p>
                      </div>
                      <ul v-if="products.length" class="space-y-2 text-sm text-highlighted">
                        <li v-for="product in products.slice(0, 4)" :key="product.id" class="truncate font-medium">
                          {{ product.name }}
                        </li>
                      </ul>
                      <p v-else class="text-sm text-muted">No items yet</p>
                    </div>
                  </template>

                  <template v-else>
                    <div class="grid gap-2 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)] sm:gap-6">
                      <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                      <p class="max-w-xl text-sm leading-6 text-muted">{{ locationManagerSummary(item.manager) }}</p>
                    </div>
                  </template>
                </NuxtLink>
              </section>
            </div>
          </div>
        </UPageBody>
      </UPage>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type CmsManagerCapability } from '~/config/cms-registry'
import { resolveDashboardManagerRoute, type DashboardManagerRouteContext } from '~/utils/dashboard-navigation'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { getTodayGoogleHours } from '~/utils/formatters'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Location Overview | KrabiClaw', robots: 'noindex, nofollow' })

interface LocationOverview {
  id: string
  title: string
  status: string
  is_primary: boolean
  phone: string | null
  email: string | null
  city: string | null
  address: { addressLines?: string[] } | null
  rating: number | null
  google_place_id: string | null
  timezone?: string | null
  opening_hours?: Parameters<typeof getTodayGoogleHours>[0]
}

interface InboxSummary {
  openThreads: number
  unreadThreads: number
}

interface LocationProductPreview {
  id: string
  name: string
}

interface LocationOverviewResource {
  location: { success: boolean; location: LocationOverview }
  products: { success: boolean; products: LocationProductPreview[] }
  threads: { summary: InboxSummary }
}

const dashboardApi = useDashboardApi()
const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const siteId = await useDashboardSiteId()
const locationId = computed(() => dashboardLocation.currentLocationId.value ?? '')
const organizationSlug = computed(() => String(route.params.orgSlug))
const siteSlug = computed(() => String(route.params.siteSlug))
const locationSlug = computed(() => String(route.params.locationSlug))
const sitePath = computed(() => `/dashboard/${encodeURIComponent(organizationSlug.value)}/sites/${encodeURIComponent(siteSlug.value)}`)
const locationPath = computed(() => `${sitePath.value}/locations/${encodeURIComponent(locationSlug.value)}`)
const managerContext = computed<DashboardManagerRouteContext>(() => ({
  scope: 'location',
  organizationSlug: organizationSlug.value,
  siteSlug: siteSlug.value,
  locationSlug: locationSlug.value,
}))
const location = ref<LocationOverview | null>(null)
const products = ref<LocationProductPreview[]>([])
const inboxSummary = ref<InboxSummary>({ openThreads: 0, unreadThreads: 0 })
const loading = ref(true)
const error = ref<string | null>(null)
const activeTab = ref('location')
const tabs = [
  { label: 'My location', value: 'location' },
  { label: 'Content', value: 'content' },
]

const dashboardLocationRow = computed(() => dashboard.locations.value.find(candidate => candidate.id === locationId.value) ?? null)
const locationImage = computed(() => {
  const media = dashboardLocationRow.value?.media.find(item => item.slot === 'hero')
  return media?.thumbnail_url || media?.public_url || ''
})
const addressSummary = computed(() => location.value?.address?.addressLines?.join(', ') || location.value?.city || 'Address not set')

const capabilities = computed(() => {
  const vertical = dashboard.site.value?.vertical
  if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
  const normalizedVertical = normalizeVertical(vertical) as SiteVertical
  const template = resolvePublicTemplate({ vertical }).slug
  return resolveCmsCapabilities(normalizedVertical, template, {
    site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides),
    location: parseCmsFeatureOverrideDelta(dashboardLocationRow.value?.feature_overrides),
  })
})

const locationManagers = computed(() => capabilities.value.managers.filter(manager => manager.scope === 'location'))
const settingsManager = computed(() => locationManagers.value.find(manager => manager.id === 'settings') ?? null)
const settingsPath = computed(() => settingsManager.value
  ? resolveDashboardManagerRoute({ manager: settingsManager.value, context: managerContext.value })
  : null)
const includeProducts = computed(() => locationManagers.value.some(manager => manager.id === 'products'))

const currentOpeningState = computed(() => {
  const hours = location.value?.opening_hours
  if (!hours) return 'Hours not set'
  const timezone = location.value?.timezone || null
  let today = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date().getDay()]
  if (timezone) {
    try {
      today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(new Date()).toUpperCase()
    } catch {
      // Use the local day when the configured timezone is invalid.
    }
  }
  return getTodayGoogleHours(hours, today) || 'Hours synced'
})

const locationStatusSummary = computed(() => {
  const parts = [currentOpeningState.value]
  if (location.value?.rating) parts.push(`${location.value.rating} rating`)
  parts.push(`${inboxSummary.value.unreadThreads} unread`)
  return parts.join(' · ')
})

function locationManagerSummary(manager: CmsManagerCapability): string {
  switch (manager.id) {
    case 'posts': return 'Publish updates and stories from this location'
    case 'qa': return 'Answer common questions from visitors'
    case 'experiences': return 'Manage bookable experiences at this location'
    case 'reservations': return 'Manage reservation settings and requests'
    default: return `Manage ${manager.label.toLowerCase()}`
  }
}

const locationManagerItems = computed(() => locationManagers.value
    .filter(manager => manager.id !== 'settings')
    .flatMap((manager) => {
      const to = resolveDashboardManagerRoute({ manager, context: managerContext.value })
      return to ? [{ manager, to }] : []
    }))

const isLocationResponse = (value: unknown): value is { success: boolean; location: LocationOverview } =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && isRecord(value.location)
  && typeof value.location.id === 'string'
  && typeof value.location.title === 'string'
  && typeof value.location.status === 'string'

const isProductsResponse = (value: unknown): value is { success: boolean; products: LocationProductPreview[] } =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && Array.isArray(value.products)
  && value.products.every(product => isRecord(product)
    && typeof product.id === 'string'
    && typeof product.name === 'string')

const isThreadsSummaryResponse = (value: unknown): value is { summary: InboxSummary } =>
  isRecord(value)
  && isRecord(value.summary)
  && typeof value.summary.openThreads === 'number'
  && typeof value.summary.unreadThreads === 'number'

const requestEvent = useRequestEvent()
const overviewKey = computed(() => `dashboard-location-overview:${siteId}:${locationId.value}:${includeProducts.value ? 'products' : 'no-products'}`)
const { data: overview, pending: overviewPending, error: overviewError } = await useAsyncData<LocationOverviewResource>(overviewKey, async () => {
  if (!locationId.value) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  const shouldIncludeProducts = includeProducts.value
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const { loadDashboardLocationOverview } = await import('~/server/utils/dashboard-editor-resources')
    return await loadDashboardLocationOverview(requestEvent, siteId, locationId.value, {
      includeProducts: shouldIncludeProducts,
    }) as LocationOverviewResource
  }

  const [locationResponse, menuResponse, threadsResponse] = await Promise.all([
    dashboardApi<{ success: boolean; location: LocationOverview }>(
      `/api/dashboard/locations/${locationId.value}`,
      { validate: isLocationResponse },
    ),
    shouldIncludeProducts
      ? dashboardApi<{ success: boolean; products: LocationProductPreview[] }>(
          `/api/editor/sites/${siteId}/locations/${locationId.value}/products`,
          { validate: isProductsResponse },
        )
      : Promise.resolve({ success: true, products: [] }),
    dashboardApi<{ summary: InboxSummary }>(`/api/dashboard/sites/${siteId}/guest-threads`, {
      query: { location_id: locationId.value },
      validate: isThreadsSummaryResponse,
    }),
  ])
  return {
    location: locationResponse,
    products: menuResponse,
    threads: threadsResponse,
  }
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
  error.value = null
}, { immediate: true })
</script>
