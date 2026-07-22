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
          <UCard><p class="text-sm text-muted">Phone</p><p class="mt-2 truncate font-semibold text-highlighted">{{ location.phone || 'Not set' }}</p></UCard>
          <UCard><p class="text-sm text-muted">Rating</p><p class="mt-2 font-semibold text-highlighted">{{ location.rating ? `${location.rating} / 5` : 'Not synced' }}</p></UCard>
          <UCard><p class="text-sm text-muted">Menus</p><p class="mt-2 font-semibold text-highlighted">{{ menus.length }}</p></UCard>
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
}

interface GoogleConnection { provider_account_email: string }

const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
if (!dashboard.state.value) await dashboard.refresh()
const locationId = computed(() => dashboardLocation.currentLocationId.value ?? '')
const locationBase = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const location = ref<LocationOverview | null>(null)
const menus = ref<ApiRecord[]>([])
const googleConnection = ref<GoogleConnection | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const addressLabel = computed(() => location.value?.address?.addressLines?.join(', ') || location.value?.city || 'Not set')
const workspaceLinks = computed(() => [
  { label: 'Content', icon: 'i-lucide-file-text', to: `${locationBase.value}/content` },
  { label: 'Menu', icon: 'i-lucide-utensils', to: `${locationBase.value}/menu` },
  { label: 'Inbox', icon: 'i-lucide-inbox', to: `${locationBase.value}/inbox` },
  { label: 'Photos', icon: 'i-lucide-image', to: `${locationBase.value}/photos` },
])

async function load() {
  loading.value = true
  error.value = null
  try {
    const [locationResponse, menuResponse, connectionResponse] = await Promise.all([
      $fetch<{ success: boolean; location: LocationOverview }>(`/api/dashboard/locations/${locationId.value}`),
      $fetch<{ success: boolean; menus: ApiRecord[] }>(`/api/dashboard/editor/menus?locationId=${locationId.value}`),
      $fetch<{ connection: GoogleConnection | null }>(`/api/dashboard/locations/${locationId.value}/integrations/google-business`),
    ])
    location.value = locationResponse.location
    menus.value = menuResponse.menus
    googleConnection.value = connectionResponse.connection
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
