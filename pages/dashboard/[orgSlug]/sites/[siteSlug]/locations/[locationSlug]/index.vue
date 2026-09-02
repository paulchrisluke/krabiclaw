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
                          <p class="text-base font-semibold text-highlighted">{{ addressSummary }}</p>
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

                  <template v-else-if="item.manager.id === 'posts'">
                    <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                      <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                      <div v-if="posts.length" class="space-y-3">
                        <article v-for="post in posts.slice(0, 3)" :key="post.id">
                          <p class="text-sm font-medium text-highlighted">{{ post.title || post.body }}</p>
                          <p v-if="post.title" class="mt-1 line-clamp-1 text-xs text-dimmed">{{ post.body }}</p>
                        </article>
                      </div>
                      <p v-else class="text-sm text-muted">No posts yet</p>
                    </div>
                  </template>

                  <template v-else-if="item.manager.id === 'qa'">
                    <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                      <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                      <dl v-if="qa.length" class="space-y-3">
                        <div v-for="entry in qa.slice(0, 3)" :key="entry.id">
                          <dt class="text-sm font-medium text-highlighted">{{ entry.question }}</dt>
                          <dd v-if="entry.answer" class="mt-1 line-clamp-1 text-xs text-dimmed">{{ entry.answer }}</dd>
                        </div>
                      </dl>
                      <p v-else class="text-sm text-muted">No questions yet</p>
                    </div>
                  </template>

                  <template v-else-if="item.manager.id === 'experiences'">
                    <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                      <div>
                        <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                        <p class="mt-1 text-sm text-muted">{{ inboxSummary.experienceBookings }} active bookings</p>
                      </div>
                      <div v-if="experiences.length" class="space-y-2">
                        <div v-for="experience in experiences.slice(0, 3)" :key="experience.id">
                          <p class="text-sm font-medium text-highlighted">{{ experience.title }}</p>
                          <p v-if="experience.tagline" class="mt-1 line-clamp-1 text-xs text-dimmed">{{ experience.tagline }}</p>
                        </div>
                      </div>
                      <p v-else class="text-sm text-muted">No experiences yet</p>
                    </div>
                  </template>

                  <template v-else-if="item.manager.id === 'reservations'">
                    <div class="flex items-baseline justify-between gap-4">
                      <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                      <p class="text-sm text-muted">{{ inboxSummary.reservations }} active</p>
                    </div>
                  </template>

                  <template v-else>
                    <h2 class="py-2 text-xl font-semibold text-highlighted">{{ item.manager.label }}</h2>
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
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
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
  reservations: number
  experienceBookings: number
}

interface LocationProductPreview {
  id: string
  name: string
}

interface LocationPostPreview { id: string; title: string | null; body: string; status: string }
interface LocationQaPreview { id: string; question: string; answer: string | null }
interface LocationExperiencePreview { id: string; title: string; tagline: string | null; status: string }

interface LocationOverviewResource {
  location: { success: boolean; location: LocationOverview }
  products: { success: boolean; products: LocationProductPreview[] }
  posts: { posts: LocationPostPreview[] }
  qa: { qa: LocationQaPreview[] }
  experiences: { experiences: LocationExperiencePreview[] }
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
const posts = ref<LocationPostPreview[]>([])
const qa = ref<LocationQaPreview[]>([])
const experiences = ref<LocationExperiencePreview[]>([])
const inboxSummary = ref<InboxSummary>({ openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 })
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
const includePosts = computed(() => locationManagers.value.some(manager => manager.id === 'posts'))
const includeQa = computed(() => locationManagers.value.some(manager => manager.id === 'qa'))
const includeExperiences = computed(() => locationManagers.value.some(manager => manager.id === 'experiences'))

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
  && typeof value.summary.reservations === 'number'
  && typeof value.summary.experienceBookings === 'number'

const isPostsResponse = (value: unknown): value is { posts: LocationPostPreview[] } =>
  isRecord(value) && Array.isArray(value.posts)
  && value.posts.every(post => isRecord(post) && typeof post.id === 'string' && typeof post.body === 'string')

const isQaResponse = (value: unknown): value is { qa: LocationQaPreview[] } =>
  isRecord(value) && Array.isArray(value.qa)
  && value.qa.every(entry => isRecord(entry) && typeof entry.id === 'string' && typeof entry.question === 'string')

const isExperiencesResponse = (value: unknown): value is { experiences: LocationExperiencePreview[] } =>
  isRecord(value) && Array.isArray(value.experiences)
  && value.experiences.every(experience => isRecord(experience)
    && typeof experience.id === 'string'
    && typeof experience.title === 'string')

const requestEvent = useRequestEvent()
const overviewKey = computed(() => `dashboard-location-overview:${siteId}:${locationId.value}:${locationManagers.value.map(manager => manager.id).join(',')}`)
const { data: overview, pending: overviewPending, error: overviewError } = await useAsyncData<LocationOverviewResource>(overviewKey, async () => {
  if (!locationId.value) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  const shouldIncludeProducts = includeProducts.value
  const shouldIncludePosts = includePosts.value
  const shouldIncludeQa = includeQa.value
  const shouldIncludeExperiences = includeExperiences.value
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const { loadDashboardLocationOverview } = await import('~/server/utils/dashboard-editor-resources')
    return await loadDashboardLocationOverview(requestEvent, siteId, locationId.value, {
      includeProducts: shouldIncludeProducts,
      includePosts: shouldIncludePosts,
      includeQa: shouldIncludeQa,
      includeExperiences: shouldIncludeExperiences,
    }) as LocationOverviewResource
  }

  const [locationResponse, menuResponse, postsResponse, qaResponse, experiencesResponse, threadsResponse] = await Promise.all([
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
    shouldIncludePosts
      ? dashboardApi<{ posts: LocationPostPreview[] }>(`/api/editor/sites/${siteId}/posts`, {
          query: { location_id: locationId.value },
          validate: isPostsResponse,
        })
      : Promise.resolve({ posts: [] }),
    shouldIncludeQa
      ? dashboardApi<{ qa: LocationQaPreview[] }>(`/api/editor/sites/${siteId}/locations/${locationId.value}/qa`, {
          validate: isQaResponse,
        })
      : Promise.resolve({ qa: [] }),
    shouldIncludeExperiences
      ? dashboardApi<{ experiences: LocationExperiencePreview[] }>(`/api/editor/sites/${siteId}/experiences`, {
          query: { location_id: locationId.value },
          validate: isExperiencesResponse,
        })
      : Promise.resolve({ experiences: [] }),
    dashboardApi<{ summary: InboxSummary }>(`/api/dashboard/sites/${siteId}/guest-threads`, {
      query: { location_id: locationId.value },
      validate: isThreadsSummaryResponse,
    }),
  ])
  return {
    location: locationResponse,
    products: menuResponse,
    posts: postsResponse,
    qa: qaResponse,
    experiences: experiencesResponse,
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
  posts.value = resource.posts.posts
  qa.value = resource.qa.qa
  experiences.value = resource.experiences.experiences
  inboxSummary.value = resource.threads.summary
  error.value = null
}, { immediate: true })
</script>
