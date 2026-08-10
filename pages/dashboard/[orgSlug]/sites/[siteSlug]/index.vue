<template>
  <UDashboardPanel id="site-overview">
    <template #header>
      <UDashboardNavbar :title="siteName">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-6">
        <USkeleton class="h-32 rounded-xl" />
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <USkeleton v-for="i in 3" :key="i" class="h-56 rounded-xl" />
        </div>
      </div>

      <div v-else class="space-y-6">
        <!-- Ask ChowBot anything -->
        <UChatPrompt
          v-if="canManageSite"
          v-model="homeInput"
          placeholder="Ask ChowBot anything..."
          :disabled="chowBot.isLoading.value"
          :loading="chowBot.isLoading.value"
          @submit="submitHomeInput"
        >
          <template #trailing>
            <UChatPromptSubmit
              :status="chowBot.isLoading.value ? 'streaming' : 'ready'"
              color="primary"
              variant="solid"
              size="xs"
              :disabled="!homeInput.trim()"
            />
          </template>
        </UChatPrompt>

        <div v-if="canManageSite && isProfessionalService" class="flex flex-wrap items-center justify-between gap-3 border-y border-default py-4">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">Firm-wide content</h2>
            <p class="mt-1 text-xs text-muted">Manage Q&A and testimonials that apply to the whole site.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton v-if="hasSiteServicesManager" icon="i-lucide-building-2" color="neutral" variant="soft" :to="`${siteDashboardPath}/professional-services`">Services</UButton>
            <UButton icon="i-lucide-circle-help" color="neutral" variant="soft" :to="`${siteDashboardPath}/qa`">Q&A</UButton>
            <UButton icon="i-lucide-star" color="neutral" variant="soft" :to="`${siteDashboardPath}/testimonials`">Testimonials</UButton>
          </div>
        </div>

        <!-- Locations overview -->
        <section v-if="locations.length > 0">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h2 class="text-lg font-semibold text-highlighted">{{ locationsNavLabel }}</h2>
              <p class="mt-1 text-sm text-muted">{{ locations.length }} {{ locations.length === 1 ? 'location' : 'locations' }}</p>
            </div>
          </div>
          <iframe
            v-if="selectedLocation?.map_embed_url"
            :key="selectedLocation.id"
            :src="selectedLocation.map_embed_url"
            :title="`${selectedLocation.title} on Google Maps`"
            class="h-64 w-full rounded-xl border border-default sm:h-80"
            loading="lazy"
            allowfullscreen
            referrerpolicy="no-referrer-when-downgrade"
          />
          <div v-else class="flex h-48 items-center justify-center rounded-xl border border-default bg-muted text-sm text-muted">
            <UIcon name="i-lucide-map-pin-off" class="mr-2 size-5" />
            Map coordinates have not been added yet
          </div>
          <div class="mt-5 divide-y divide-default">
            <button
              v-for="location in locations"
              :key="location.id"
              type="button"
              class="group flex w-full items-center gap-4 rounded-lg px-2 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
              :class="selectedLocationId === location.id ? 'bg-elevated' : ''"
              @click="selectedLocationId = location.id"
            >
                <div class="size-14 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-16">
                  <img
                    v-if="location.hero_url"
                    :src="cfImageVariant(location.hero_url, { width: 160 }) ?? undefined"
                    :alt="location.title"
                    class="size-full object-cover"
                    loading="lazy"
                  />
                  <div v-else class="flex size-full items-center justify-center">
                    <UIcon name="i-lucide-map-pin" class="size-5 text-muted" />
                  </div>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                      <p class="font-semibold text-highlighted">{{ location.title }}</p>
                    <UBadge v-if="location.is_primary" color="primary" variant="soft" size="xs">Primary</UBadge>
                  </div>
                  <p class="mt-1 truncate text-sm text-muted">{{ locationAddress(location) }}</p>
                </div>
                <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </section>

        <UCard v-if="events.length > 0" title="Recent Activity">
          <ul class="-mx-4 -mb-4">
            <li v-for="ev in events" :key="ev.id" class="flex items-start gap-3 px-4 py-3 border-b border-default last:border-0">
              <UAvatar :src="ev.actor_image ?? undefined" :alt="ev.actor_name ?? 'System'" size="2xs" class="mt-0.5 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-xs text-highlighted leading-snug">
                  {{ eventLabel(ev.event_type) }}
                  <span v-if="ev.location_title" class="text-muted"> · {{ ev.location_title }}</span>
                </p>
                <p class="text-xs text-muted mt-0.5">{{ timeAgo(ev.created_at) }}</p>
              </div>
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const dashboardApi = useDashboardApi()
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Dashboard | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const dashboardState = useDashboardSite()

interface Location {
  id: string; slug: string; title: string; city: string | null
  rating: number | null; review_count: number | null
  is_primary: boolean; status: string; updated_at: string
  hero_url: string | null
  address: { addressLines?: string[] } | null
  latitude: number | null; longitude: number | null
  map_embed_url: string | null
}
interface SiteEvent {
  id: string; event_type: string; location_id: string | null
  metadata: Record<string, unknown> | null; created_at: string
  actor_name: string | null; actor_image: string | null; location_title: string | null
}
interface OperationsSummary {
  openThreads: number
  unreadThreads: number
  reservations: number
  experienceBookings: number
}

type DashboardHomeResponse = {
  locations: Location[]
  events: SiteEvent[]
  operations: OperationsSummary
}

const isDashboardHomeResponse = (value: unknown): value is DashboardHomeResponse =>
  isRecord(value)
  && Array.isArray(value.locations)
  && value.locations.every(location =>
    isRecord(location)
    && typeof location.id === 'string'
    && typeof location.slug === 'string'
    && typeof location.title === 'string'
    && (location.address === null || (
      isRecord(location.address)
      && (location.address.addressLines === undefined || (
        Array.isArray(location.address.addressLines)
        && location.address.addressLines.every(line => typeof line === 'string')
      ))
    ))
    && (location.latitude === null || typeof location.latitude === 'number')
    && (location.longitude === null || typeof location.longitude === 'number')
    && (location.map_embed_url === null || typeof location.map_embed_url === 'string'),
  )
  && Array.isArray(value.events)
  && value.events.every(event =>
    isRecord(event) && typeof event.id === 'string' && typeof event.event_type === 'string',
  )
  && isRecord(value.operations)
  && typeof value.operations.openThreads === 'number'
  && typeof value.operations.unreadThreads === 'number'
  && typeof value.operations.reservations === 'number'
  && typeof value.operations.experienceBookings === 'number'

const requestEvent = useRequestEvent()

const { data, pending } = await useAsyncData(
  `dashboard-home-${route.params.orgSlug}-${route.params.siteSlug}`,
  async () => {
    // Bypass the self-fetch entirely on the server — the dashboard context and
    // home data are loaded directly against the real request event.
    if (import.meta.server) {
      if (!requestEvent) {
        throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      }

      const [{ cloudflareEnv }, { getDashboardContext }, { getDashboardHomeData }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/dashboard-context'),
        import('~/server/utils/dashboard-home'),
      ])

      // getDashboardContext resolves org/site from the x-dashboard-org-slug/site-slug
      // headers (see plugins/dashboard-site-header.client.ts), which the real inbound
      // SSR request never carries — this route's params are already the authoritative
      // source for them, so set the headers directly on the real event rather than
      // re-deriving them through a second fetch.
      const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
      const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
      if (orgSlug) requestEvent.node.req.headers['x-dashboard-org-slug'] = orgSlug
      if (siteSlug) requestEvent.node.req.headers['x-dashboard-site-slug'] = siteSlug

      // requireOrganization defaults to true, so a missing/inaccessible organization
      // throws here rather than needing a manual null check. A missing site is a
      // legitimate state (mirrors home.get.ts's own `!site` branch, e.g. onboarding
      // in progress) and returns empty data rather than erroring.
      const context = await getDashboardContext(requestEvent, {
        requireSite: false,
        pathname: '/api/dashboard/home',
      })
      if (!context.site) {
        return {
          locations: [],
          events: [],
          operations: { openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 },
        }
      }

      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      return await getDashboardHomeData(db, context.organization.id, context.site.id, {
        memberId: context.organization.memberId,
        role: context.organization.role,
      })
    }

    return dashboardApi<DashboardHomeResponse>('/api/dashboard/home', {
      validate: isDashboardHomeResponse,
    })
  },
  // Reuse the SSR payload on first hydration (avoids a redundant duplicate fetch
  // on initial load), but force a fresh fetch on every subsequent client-side
  // navigation back to this page — otherwise this overview keeps showing
  // "No locations yet" after a location was added elsewhere in the same SPA
  // session (e.g. via the add-location wizard), since the key doesn't change
  // between visits and Nuxt would otherwise reuse the stale cached result.
  { getCachedData: (key, nuxtApp) => nuxtApp.isHydrating ? nuxtApp.payload.data[key] : undefined }
)

const locations = computed(() => data.value?.locations ?? [])
const siteName = computed(() => dashboardState.site.value?.brand_name ?? 'Overview')
const canManageSite = computed(() => dashboardState.siteAccess.value === 'organization' || dashboardState.siteAccess.value === 'site')
const isProfessionalService = computed(() => ['service', 'professional_service'].includes(dashboardState.site.value?.vertical ?? ''))
const siteCapabilities = computed(() => {
  const vertical = dashboardState.site.value?.vertical
  if (!vertical) return null
  try {
    const normalizedVertical = normalizeVertical(vertical) as SiteVertical
    const template = resolvePublicTemplate({ vertical }).slug
    return resolveCmsCapabilities(normalizedVertical, template, {
      site: parseCmsFeatureOverrideDelta(dashboardState.site.value?.feature_overrides),
    })
  } catch {
    return null
  }
})
const hasSiteServicesManager = computed(() => Boolean(siteCapabilities.value?.managers.some(manager => manager.key === 'site.services')))
const siteDashboardPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}`)
const events = computed(() => data.value?.events ?? [])
const locationsNavLabel = computed(() => siteCapabilities.value?.locationVocabulary === 'office/service area' ? 'Offices / Service Areas' : 'Locations')
const selectedLocationId = ref<string | null>(null)
watch(locations, (value) => {
  if (!value.some(location => location.id === selectedLocationId.value)) {
    selectedLocationId.value = value.find(location => location.is_primary)?.id ?? value[0]?.id ?? null
  }
}, { immediate: true })
const selectedLocation = computed(() =>
  locations.value.find(location => location.id === selectedLocationId.value) ?? locations.value[0] ?? null,
)

function locationAddress(location: Location) {
  return location.address?.addressLines?.filter(Boolean).join(', ') || location.city || 'Address not set'
}

const chowBot = useChowBot()
const homeInput = ref('')
async function submitHomeInput() {
  const text = homeInput.value.trim()
  if (!text) return
  homeInput.value = ''
  chowBot.open()
  await chowBot.sendMessage(text)
}

const { eventLabel } = useSiteEventLabels()
const { formatRelativeTime: timeAgo } = useHumanTime()
</script>
