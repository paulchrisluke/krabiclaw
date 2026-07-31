<template>
  <UDashboardPanel id="location-overview">
    <template #header>
      <UDashboardNavbar :title="location?.title || 'Location Overview'">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #right>
          <UButton icon="i-lucide-settings" color="neutral" variant="outline" :to="`${locationBase}/settings`">Settings</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-4">
        <USkeleton class="h-28 rounded-xl" />
        <USkeleton class="h-64 rounded-xl" />
      </div>
      <UAlert v-else-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="error" />
      <div v-else-if="location" class="space-y-6">
        <UCard>
          <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wider text-primary">Today</p>
              <h2 class="mt-1 text-xl font-semibold text-highlighted">{{ location.title }}</h2>
              <p class="mt-1 text-sm text-muted">
                {{ currentOpeningState }} · {{ inboxSummary.unreadThreads }} unread · {{ inboxSummary.openThreads }} open guest {{ inboxSummary.openThreads === 1 ? 'request' : 'requests' }}
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
              <div class="rounded-lg border border-default bg-muted px-3 py-2">
                <p class="text-xs text-muted">Status</p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <UBadge :color="location.status === 'active' ? 'success' : 'neutral'" variant="soft" class="capitalize">{{ location.status }}</UBadge>
                  <UBadge v-if="location.is_primary" color="primary" variant="soft">Primary</UBadge>
                </div>
              </div>
              <div class="rounded-lg border border-default bg-muted px-3 py-2">
                <p class="text-xs text-muted">Rating</p>
                <p class="mt-1 text-sm font-semibold text-highlighted">{{ hasReviews && location.rating ? `${location.rating} / 5` : 'Not synced' }}</p>
              </div>
              <div class="rounded-lg border border-default bg-muted px-3 py-2">
                <p class="text-xs text-muted">Inbox</p>
                <p class="mt-1 text-2xl font-semibold text-highlighted">{{ inboxSummary.unreadThreads }}</p>
              </div>
              <div class="rounded-lg border border-default bg-muted px-3 py-2">
                <p class="text-xs text-muted">{{ primaryManageLabel }}</p>
                <p class="mt-1 text-sm font-semibold text-highlighted">{{ primaryManageValue }}</p>
              </div>
            </div>
          </div>
        </UCard>

        <UAlert
          v-if="needsGoogleConnection"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Connect Google Business Profile"
          description="Syncing this location keeps hours, photos, and profile details current from the source."
          :actions="[{ label: 'Manage integrations', to: `${locationBase}/settings`, color: 'warning', variant: 'soft' }]"
        />

        <div class="grid gap-6 xl:grid-cols-2">
          <UCard>
            <template #header><h2 class="font-semibold text-highlighted">Profile</h2></template>
            <dl class="space-y-4 text-sm">
              <div><dt class="text-muted">Address</dt><dd class="mt-1 text-highlighted">{{ addressLabel }}</dd></div>
              <div><dt class="text-muted">Email</dt><dd class="mt-1 text-highlighted">{{ location.email || 'Not set' }}</dd></div>
              <div><dt class="text-muted">Timezone</dt><dd class="mt-1 text-highlighted">{{ location.timezone || 'Site default' }}</dd></div>
              <div><dt class="text-muted">Notification routing</dt><dd class="mt-1 text-highlighted">{{ location.notification_phone || 'Site default' }}</dd></div>
            </dl>
          </UCard>

          <UCard>
            <template #header><h2 class="font-semibold text-highlighted">Connected Services</h2></template>
            <div class="space-y-4 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="text-highlighted">Google Business Profile</span>
                <UBadge :color="googleConnection ? 'success' : 'neutral'" variant="soft">{{ googleConnection ? 'Connected' : 'Not connected' }}</UBadge>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-highlighted">Google Places</span>
                <UBadge :color="location.google_place_id ? 'success' : 'neutral'" variant="soft">{{ location.google_place_id ? 'Configured' : 'Not configured' }}</UBadge>
              </div>
              <p v-if="googleConnection" class="text-muted">Account: {{ googleConnection.provider_account_email }}</p>
              <UButton color="neutral" variant="outline" :to="`${locationBase}/settings`">Manage integrations</UButton>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header><h2 class="font-semibold text-highlighted">Manage</h2></template>
          <div class="divide-y divide-default">
            <NuxtLink
              v-for="item in workspaceLinks"
              :key="item.to"
              :to="item.to"
              class="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <span class="flex min-w-0 items-center gap-3 font-medium text-highlighted">
                <UIcon :name="item.icon" class="size-4 text-muted" />
                <span class="truncate">{{ item.label }}</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
            </NuxtLink>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const dashboardApi = useDashboardApi()
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { getTodayGoogleHours } from '~/utils/formatters'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })

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
  notification_phone?: string | null
  opening_hours?: Parameters<typeof getTodayGoogleHours>[0]
}

interface GoogleConnection { provider_account_email: string }
interface InboxSummary { openThreads: number; unreadThreads: number }

const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = await useDashboardSiteId()
const locationId = computed(() => dashboardLocation.currentLocationId.value ?? '')
const locationBase = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const location = ref<LocationOverview | null>(null)
const menus = ref<ApiRecord[]>([])
const inboxSummary = ref<InboxSummary>({ openThreads: 0, unreadThreads: 0 })
const googleConnection = ref<GoogleConnection | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const addressLabel = computed(() => location.value?.address?.addressLines?.join(', ') || location.value?.city || 'Not set')
const capabilities = computed(() => {
  const vertical = dashboard.site.value?.vertical
  if (!vertical) return null
  try {
    const normalizedVertical = normalizeVertical(vertical) as SiteVertical
    const template = resolvePublicTemplate({ vertical }).slug
    const locationRow = dashboard.locations.value.find(candidate => candidate.id === locationId.value) ?? null
    return resolveCmsCapabilities(normalizedVertical, template, {
      site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides),
      location: parseCmsFeatureOverrideDelta(locationRow?.feature_overrides),
    })
  } catch {
    return null
  }
})
const featureSet = computed(() => new Set<ProductFeature>([
  ...(capabilities.value?.pages.map(page => page.feature) ?? []),
  ...(capabilities.value?.managers.map(manager => manager.id) ?? []),
]))
const hasMenu = computed(() => featureSet.value.has('menu'))
const hasReviews = computed(() => featureSet.value.has('reviews'))
const hasReservations = computed(() => featureSet.value.has('reservations'))
const hasExperiences = computed(() => featureSet.value.has('experiences'))
const needsGoogleConnection = computed(() => !googleConnection.value || !location.value?.google_place_id)
const primaryManageItem = computed(() => workspaceLinks.value.find(item => ['menu', 'experiences', 'services'].includes(item.feature)) ?? workspaceLinks.value[0] ?? null)
const primaryManageLabel = computed(() => primaryManageItem.value?.label ?? 'Manage')
const primaryManageValue = computed(() => {
  if (primaryManageItem.value?.feature === 'menu') return `${menus.value.length} ${menus.value.length === 1 ? 'menu' : 'menus'}`
  return primaryManageItem.value ? 'Ready' : 'Not set'
})
const currentOpeningState = computed(() => {
  const hours = location.value?.opening_hours
  if (!hours) return 'Not set'
  const timezone = location.value?.timezone || null
  let today = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date().getDay()]
  if (timezone) {
    try {
      today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(new Date()).toUpperCase()
    } catch { /* use local day */ }
  }
  return getTodayGoogleHours(hours, today) || 'Hours synced'
})
const workspaceLinks = computed(() => [
  { feature: 'content', label: 'Content', icon: 'i-lucide-file-text', to: `${locationBase.value}/content`, visible: true },
  { feature: 'inbox', label: 'Inbox', icon: 'i-lucide-inbox', to: `${locationBase.value}/inbox`, visible: true },
  { feature: 'menu', label: 'Menu', icon: 'i-lucide-utensils', to: `${locationBase.value}/menu`, visible: hasMenu.value },
  { feature: 'services', label: 'Services', icon: 'i-lucide-briefcase', to: `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/professional-services`, visible: featureSet.value.has('services') },
  { feature: 'reservations', label: 'Reservations', icon: 'i-lucide-calendar-check', to: `${locationBase.value}/reservations`, visible: hasReservations.value },
  { feature: 'experiences', label: 'Experiences', icon: 'i-lucide-ticket', to: `${locationBase.value}/experiences`, visible: hasExperiences.value },
  { feature: 'photos', label: 'Photos', icon: 'i-lucide-image', to: `${locationBase.value}/photos`, visible: featureSet.value.has('photos') },
  { feature: 'qa', label: 'Q&A', icon: 'i-lucide-message-circle-question', to: `${locationBase.value}/qa`, visible: featureSet.value.has('qa') },
  { feature: 'settings', label: 'Settings', icon: 'i-lucide-settings', to: `${locationBase.value}/settings`, visible: true },
].filter(item => item.visible))

async function load() {
  loading.value = true
  error.value = null
  try {
    const [locationResponse, menuResponse, connectionResponse, threadsResponse] = await Promise.all([
      dashboardApi<{ success: boolean; location: LocationOverview }>(`/api/dashboard/locations/${locationId.value}`),
      hasMenu.value
        ? dashboardApi<{ success: boolean; menus: ApiRecord[] }>(`/api/editor/sites/${siteId}/menus?locationId=${locationId.value}`)
        : Promise.resolve({ success: true, menus: [] }),
      dashboardApi<{ connection: GoogleConnection | null }>(`/api/sites/${siteId}/locations/${locationId.value}/integrations/google-business`),
      dashboardApi<{ summary: InboxSummary }>(`/api/dashboard/sites/${siteId}/guest-threads`, {
        query: { location_id: locationId.value },
      }),
    ])
    location.value = locationResponse.location
    menus.value = menuResponse.menus
    googleConnection.value = connectionResponse.connection
    inboxSummary.value = threadsResponse.summary ?? { openThreads: 0, unreadThreads: 0 }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load location overview'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(locationId, load)
useSeoMeta({ title: 'Location Overview | KrabiClaw', robots: 'noindex, nofollow' })
</script>
