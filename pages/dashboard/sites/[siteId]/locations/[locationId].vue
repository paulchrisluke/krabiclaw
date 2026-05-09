<template>
  <UPage>
    <UPageHeader
      :title="location?.title || 'Location'"
      :description="locationAddress || location?.city || 'Location workspace'"
      :links="headerLinks"
    >
      <template #headline>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge v-if="location?.is_primary" color="primary" variant="soft">Primary</UBadge>
          <UBadge v-if="location" :color="location.status === 'active' ? 'success' : 'warning'" variant="soft">{{ location.status }}</UBadge>
        </div>
      </template>
    </UPageHeader>

    <UPageBody>
      <UCard v-if="loading">
        <div class="flex items-center gap-3 text-sm text-(--ui-text-muted)">
          <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
          Loading location...
        </div>
      </UCard>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :description="error"
      />

      <div v-else-if="location" class="space-y-6">
        <UCard>
          <div class="flex flex-wrap gap-1">
            <UButton
              v-for="tab in locationTabs"
              :key="tab.label"
              :to="tab.to"
              :icon="tab.icon"
              :variant="tab.active ? 'soft' : 'ghost'"
              :color="tab.active ? 'primary' : 'neutral'"
            >
              {{ tab.label }}
            </UButton>
          </div>
        </UCard>

        <div class="grid gap-4 md:grid-cols-4">
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Phone</p>
            <p class="mt-2 truncate font-semibold text-(--ui-text-highlighted)">{{ location.phone || 'Not set' }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Rating</p>
            <p class="mt-2 font-semibold text-(--ui-text-highlighted)">{{ location.rating ? `${location.rating} / 5` : 'Not synced' }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Reviews</p>
            <p class="mt-2 font-semibold text-(--ui-text-highlighted)">{{ location.review_count ?? 0 }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Menus</p>
            <p class="mt-2 font-semibold text-(--ui-text-highlighted)">{{ menus.length }}</p>
          </UCard>
        </div>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-(--ui-text-highlighted)">Local Work</h2>
            </template>

            <div class="grid gap-3 md:grid-cols-2">
              <UButton
                v-for="action in workspaceActions"
                :key="action.label"
                :to="action.to"
                :icon="action.icon"
                color="neutral"
                variant="soft"
                block
                class="justify-start"
              >
                {{ action.label }}
              </UButton>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-(--ui-text-highlighted)">Google Business</h2>
            </template>

            <div class="space-y-4 text-sm">
              <div class="flex items-center justify-between gap-4">
                <span class="text-(--ui-text-muted)">Connection</span>
                <UBadge :color="location.google_location_id ? 'success' : 'neutral'" variant="soft">
                  {{ location.google_location_id ? 'Connected' : 'Not connected' }}
                </UBadge>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-(--ui-text-muted)">Last synced</span>
                <span class="text-right text-(--ui-text-highlighted)">{{ location.last_synced_at || 'Never' }}</span>
              </div>
              <UButton
                :to="`/dashboard/sites/${siteId}/settings?tab=integrations&locationId=${locationId}`"
                icon="i-heroicons-link"
                block
              >
                Manage Mapping
              </UButton>
              <UButton
                v-if="location.maps_url"
                :to="location.maps_url"
                target="_blank"
                color="neutral"
                variant="soft"
                icon="i-heroicons-map"
                block
              >
                Open Maps
              </UButton>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-(--ui-text-highlighted)">Details</h2>
          </template>

          <dl class="grid gap-4 md:grid-cols-2">
            <div>
              <dt class="text-sm text-(--ui-text-muted)">Slug</dt>
              <dd class="mt-1 font-medium text-(--ui-text-highlighted)">/{{ location.slug }}</dd>
            </div>
            <div>
              <dt class="text-sm text-(--ui-text-muted)">Address</dt>
              <dd class="mt-1 font-medium text-(--ui-text-highlighted)">{{ locationAddress || 'Not set' }}</dd>
            </div>
          </dl>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface BusinessLocation {
  id: string
  slug: string
  title: string
  address: { addressLines?: string[] } | null
  city: string | null
  phone: string | null
  maps_url: string | null
  rating: number | null
  review_count: number | null
  is_primary: boolean
  status: string
  google_location_id: string | null
  last_synced_at: string | null
}

const route = useRoute()
const siteId = route.params.siteId as string
const locationId = route.params.locationId as string

const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<any>(null)
const location = ref<BusinessLocation | null>(null)
const menus = ref<any[]>([])

const locationAddress = computed(() => location.value?.address?.addressLines?.join(', ') || '')
const publicLocationUrl = computed(() => {
  if (!site.value?.public_url || !location.value?.slug) return ''
  return `${site.value.public_url.replace(/\/$/, '')}/locations/${location.value.slug}`
})

const headerLinks = computed(() => [
  { label: 'All Locations', icon: 'i-heroicons-arrow-left', to: `/dashboard/sites/${siteId}/locations`, color: 'neutral' as const, variant: 'soft' as const },
  { label: 'View', icon: 'i-heroicons-arrow-top-right-on-square', to: publicLocationUrl.value, target: '_blank', color: 'neutral' as const, variant: 'outline' as const, disabled: !publicLocationUrl.value }
])

const locationTabs = computed(() => [
  { label: 'Overview', icon: 'i-heroicons-home', active: true, to: `/dashboard/sites/${siteId}/locations/${locationId}` },
  { label: 'Content', icon: 'i-heroicons-document-text', active: false, to: `/dashboard/sites/${siteId}/content?locationId=${locationId}&page=location` },
  { label: 'Menu', icon: 'i-heroicons-list-bullet', active: false, to: `/dashboard/sites/${siteId}/menu?locationId=${locationId}` },
  { label: 'Details', icon: 'i-heroicons-map-pin', active: false, to: `/dashboard/sites/${siteId}/settings?tab=locations&locationId=${locationId}` },
  { label: 'Google Business', icon: 'i-heroicons-link', active: false, to: `/dashboard/sites/${siteId}/settings?tab=integrations&locationId=${locationId}` }
])

const workspaceActions = computed(() => [
  { label: 'Edit Local Content', icon: 'i-heroicons-document-text', to: `/dashboard/sites/${siteId}/content?locationId=${locationId}&page=location` },
  { label: 'Edit Local Menu', icon: 'i-heroicons-list-bullet', to: `/dashboard/sites/${siteId}/menu?locationId=${locationId}` },
  { label: 'Edit Location Details', icon: 'i-heroicons-cog-6-tooth', to: `/dashboard/sites/${siteId}/settings?tab=locations&locationId=${locationId}` },
  { label: 'Edit Brand Content', icon: 'i-heroicons-building-storefront', to: `/dashboard/sites/${siteId}/content` }
])

const loadLocationWorkspace = async () => {
  loading.value = true
  error.value = null
  try {
    const [settingsResponse, locationResponse, menusResponse] = await Promise.all([
      $fetch<any>(`/api/sites/${siteId}/settings`),
      $fetch<{ success: boolean; location: BusinessLocation }>(`/api/sites/${siteId}/locations/${locationId}`),
      $fetch<{ success: boolean; menus: any[] }>(`/api/editor/sites/${siteId}/menus?locationId=${locationId}`)
    ])

    if (!settingsResponse.success) throw new Error('Failed to load site settings')
    if (!locationResponse.success) throw new Error('Failed to load location')
    if (!menusResponse.success) throw new Error('Failed to load menus')

    site.value = settingsResponse.settings
    location.value = locationResponse.location
    menus.value = menusResponse.menus
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load location'
  } finally {
    loading.value = false
  }
}

onMounted(loadLocationWorkspace)

useSeoMeta({ title: 'Location Workspace | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
