<template>
  <UDashboardPanel id="location-overview">
    <template #header>
      <UDashboardNavbar :title="location?.title || 'Location'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="sitePath" label="Site overview" />
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
                  :ui="{ list: 'w-full', trigger: 'flex-1' }"
                />
                <UButton
                  :to="settingsPath"
                  icon="i-lucide-settings"
                  color="neutral"
                  variant="ghost"
                  square
                  aria-label="Location settings"
                />
              </div>

              <div v-if="activeTab === 'location'" class="space-y-4">
                <NuxtLink :to="`${settingsPath}/profile`" class="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
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

                <NuxtLink :to="`${settingsPath}/hours`" class="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
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

                <NuxtLink :to="`${settingsPath}/discovery`" class="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
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

              <EditorNavigationList v-else :groups="contentGroups" />
            </div>
          </div>
        </UPageBody>
      </UPage>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type ProductFeature } from '~/config/cms-registry'
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

interface LocationOverviewResource {
  location: { success: boolean; location: LocationOverview }
  products: { success: boolean; products: ApiRecord[] }
  threads: { summary: InboxSummary }
}

const dashboardApi = useDashboardApi()
const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const siteId = await useDashboardSiteId()
const locationId = computed(() => dashboardLocation.currentLocationId.value ?? '')
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const locationPath = computed(() => `${sitePath.value}/locations/${String(route.params.locationSlug)}`)
const settingsPath = computed(() => `${locationPath.value}/settings`)
const location = ref<LocationOverview | null>(null)
const products = ref<ApiRecord[]>([])
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
  if (!vertical) return null
  try {
    const normalizedVertical = normalizeVertical(vertical) as SiteVertical
    const template = resolvePublicTemplate({ vertical }).slug
    return resolveCmsCapabilities(normalizedVertical, template, {
      site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides),
      location: parseCmsFeatureOverrideDelta(dashboardLocationRow.value?.feature_overrides),
    })
  } catch {
    return null
  }
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

const contentGroups = computed(() => {
  const publicContent = [
    {
      id: 'photos',
      label: 'Photos',
      summary: 'Manage the images shown for this location',
      to: `${locationPath.value}/photos`,
      visible: hasFeature('photos'),
    },
    {
      id: 'products',
      label: dashboard.site.value?.vertical === 'restaurant' ? 'Menu' : 'Products',
      summary: `${products.value.length} ${products.value.length === 1 ? 'product' : 'products'}`,
      to: `${locationPath.value}/products`,
      visible: hasFeature('products'),
    },
    {
      id: 'experiences',
      label: 'Experiences',
      summary: 'Manage bookable experiences',
      to: `${locationPath.value}/experiences`,
      visible: hasFeature('experiences'),
    },
    {
      id: 'posts',
      label: 'Posts',
      summary: 'Publish updates and stories from this location',
      to: `${locationPath.value}/posts`,
      visible: hasFeature('posts'),
    },
    {
      id: 'qa',
      label: 'Q&A',
      summary: 'Manage guest questions and answers',
      to: `${locationPath.value}/qa`,
      visible: hasFeature('qa'),
    },
  ].filter(item => item.visible !== false)

  const operations = [
    {
      id: 'reservations',
      label: 'Reservations',
      summary: 'Manage reservation requests and bookings',
      to: `${locationPath.value}/reservations`,
      visible: hasFeature('reservations'),
    },
  ].filter(item => item.visible !== false)

  return [
    { id: 'public-content', items: publicContent },
    { id: 'operations', label: 'Manage', items: operations },
  ].filter(group => group.items.length > 0)
})

const isLocationResponse = (value: unknown): value is { success: boolean; location: LocationOverview } =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && isRecord(value.location)
  && typeof value.location.id === 'string'
  && typeof value.location.title === 'string'
  && typeof value.location.status === 'string'

const isProductsResponse = (value: unknown): value is { success: boolean; products: ApiRecord[] } =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && Array.isArray(value.products)
  && value.products.every(product => isRecord(product) && typeof product.id === 'string')

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
      ? dashboardApi<{ success: boolean; products: ApiRecord[] }>(
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
