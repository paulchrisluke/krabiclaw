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
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UCard>
            <p class="text-sm text-muted">Status</p>
            <div class="mt-2 flex items-center gap-2">
              <UBadge :color="location.status === 'active' ? 'success' : 'neutral'" variant="soft" class="capitalize">{{ location.status }}</UBadge>
              <UBadge v-if="location.is_primary" color="primary" variant="soft">Primary</UBadge>
            </div>
          </UCard>
          <UCard><p class="text-sm text-muted">Open now</p><p class="mt-2 truncate font-semibold text-highlighted">{{ currentOpeningState }}</p></UCard>
          <UCard v-if="hasReviews"><p class="text-sm text-muted">Rating</p><p class="mt-2 font-semibold text-highlighted">{{ location.rating ? `${location.rating} / 5` : 'Not synced' }}</p></UCard>
          <UCard v-if="hasMenu"><p class="text-sm text-muted">Menus</p><p class="mt-2 font-semibold text-highlighted">{{ menus.length }}</p></UCard>
          <UCard><p class="text-sm text-muted">Unread inbox</p><p class="mt-2 font-semibold text-highlighted">{{ inboxSummary.unreadThreads }}</p></UCard>
          <UCard><p class="text-sm text-muted">Open guest work</p><p class="mt-2 font-semibold text-highlighted">{{ inboxSummary.openThreads }}</p></UCard>
        </div>

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
          <template #header><h2 class="font-semibold text-highlighted">Location Workspace</h2></template>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <UButton v-for="item in workspaceLinks" :key="item.to" :to="item.to" :icon="item.icon" color="neutral" variant="soft" block>{{ item.label }}</UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
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
interface ThreadSummary { inbox_status: string; unread_count: number; submission_type: string }

const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = await useDashboardSiteId()
const locationId = computed(() => dashboardLocation.currentLocationId.value ?? '')
const locationBase = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const location = ref<LocationOverview | null>(null)
const menus = ref<ApiRecord[]>([])
const threads = ref<ThreadSummary[]>([])
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
const inboxSummary = computed(() => ({
  unreadThreads: threads.value.filter(thread => thread.unread_count > 0).length,
  openThreads: threads.value.filter(thread => thread.inbox_status !== 'closed').length,
}))
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
  { label: 'Content', icon: 'i-lucide-file-text', to: `${locationBase.value}/content`, visible: true },
  { label: 'Inbox', icon: 'i-lucide-inbox', to: `${locationBase.value}/inbox`, visible: true },
  { label: 'Menu', icon: 'i-lucide-utensils', to: `${locationBase.value}/menu`, visible: hasMenu.value },
  { label: 'Reservations', icon: 'i-lucide-calendar-check', to: `${locationBase.value}/reservations`, visible: hasReservations.value },
  { label: 'Experiences', icon: 'i-lucide-ticket', to: `${locationBase.value}/experiences`, visible: hasExperiences.value },
  { label: 'Photos', icon: 'i-lucide-image', to: `${locationBase.value}/photos`, visible: featureSet.value.has('photos') },
  { label: 'Q&A', icon: 'i-lucide-message-circle-question', to: `${locationBase.value}/qa`, visible: featureSet.value.has('qa') },
  { label: 'Settings', icon: 'i-lucide-settings', to: `${locationBase.value}/settings`, visible: true },
].filter(item => item.visible))

async function load() {
  loading.value = true
  error.value = null
  try {
    const [locationResponse, menuResponse, connectionResponse, threadsResponse] = await Promise.all([
      $fetch<{ success: boolean; location: LocationOverview }>(`/api/dashboard/locations/${locationId.value}`),
      hasMenu.value
        ? $fetch<{ success: boolean; menus: ApiRecord[] }>(`/api/dashboard/editor/menus?locationId=${locationId.value}`)
        : Promise.resolve({ success: true, menus: [] }),
      $fetch<{ connection: GoogleConnection | null }>(`/api/dashboard/locations/${locationId.value}/integrations/google-business`),
      $fetch<{ threads: ThreadSummary[] }>(`/api/dashboard/sites/${siteId}/guest-threads`, {
        query: { location_id: locationId.value },
      }),
    ])
    location.value = locationResponse.location
    menus.value = menuResponse.menus
    googleConnection.value = connectionResponse.connection
    threads.value = threadsResponse.threads ?? []
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
