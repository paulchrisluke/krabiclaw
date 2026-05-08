<template>
  <div class="space-y-8">
    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <NuxtLink :to="`/dashboard/sites/${siteId}/locations`" class="inline-flex items-center gap-2 text-sm text-(--ui-text-muted) hover:text-(--ui-text)">
          <UIcon name="i-heroicons-arrow-left" class="size-4" />
          Locations
        </NuxtLink>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <h1 class="text-3xl font-bold text-(--ui-text-highlighted)">{{ location?.title || 'Location' }}</h1>
          <UBadge v-if="location?.is_primary" color="primary" variant="soft">Primary</UBadge>
          <UBadge v-if="location" :color="location.status === 'active' ? 'success' : 'warning'" variant="soft">{{ location.status }}</UBadge>
        </div>
        <p class="mt-2 text-(--ui-text-muted)">{{ locationAddress || location?.city || 'No address set' }}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton :to="`/dashboard/sites/${siteId}/content?locationId=${locationId}&page=location`" icon="i-heroicons-document-text">
          Edit Content
        </UButton>
        <UButton :to="`/dashboard/sites/${siteId}/menu?locationId=${locationId}`" color="neutral" variant="soft" icon="i-heroicons-list-bullet">
          Menu
        </UButton>
        <UButton :to="`/dashboard/sites/${siteId}/settings?tab=locations&locationId=${locationId}`" color="neutral" variant="soft" icon="i-heroicons-cog-6-tooth">
          Settings
        </UButton>
      </div>
    </div>

    <div v-if="location" class="border-b border-(--ui-border)">
      <div class="flex flex-wrap gap-1">
        <UButton
          v-for="tab in locationTabs"
          :key="tab.label"
          :to="tab.to"
          :icon="tab.icon"
          :variant="tab.active ? 'soft' : 'ghost'"
          :color="tab.active ? 'primary' : 'neutral'"
          class="rounded-b-none"
        >
          {{ tab.label }}
        </UButton>
      </div>
    </div>

    <div v-if="loading" class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-8 text-center text-sm text-(--ui-text-muted)">
      Loading location...
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :description="error"
    />

    <div v-else-if="location" class="space-y-8">
      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-5">
          <p class="text-sm text-(--ui-text-muted)">Phone</p>
          <p class="mt-2 font-semibold text-(--ui-text-highlighted)">{{ location.phone || 'Not set' }}</p>
        </div>
        <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-5">
          <p class="text-sm text-(--ui-text-muted)">Rating</p>
          <p class="mt-2 font-semibold text-(--ui-text-highlighted)">{{ location.rating ? `${location.rating} / 5` : 'Not synced' }}</p>
        </div>
        <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-5">
          <p class="text-sm text-(--ui-text-muted)">Reviews</p>
          <p class="mt-2 font-semibold text-(--ui-text-highlighted)">{{ location.review_count ?? 0 }}</p>
        </div>
        <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-5">
          <p class="text-sm text-(--ui-text-muted)">Menus</p>
          <p class="mt-2 font-semibold text-(--ui-text-highlighted)">{{ menus.length }}</p>
        </div>
      </div>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold text-(--ui-text-highlighted)">Location Workspace</h2>
              <p class="mt-1 text-sm text-(--ui-text-muted)">Content, menu, and local business data for this location.</p>
            </div>
            <UButton v-if="publicLocationUrl" :to="publicLocationUrl" target="_blank" color="neutral" variant="ghost" icon="i-heroicons-arrow-top-right-on-square">
              View
            </UButton>
          </div>

          <div class="mt-6 grid gap-3 md:grid-cols-2">
            <NuxtLink
              v-for="action in workspaceActions"
              :key="action.label"
              :to="action.to"
              class="rounded-lg border border-(--ui-border) p-4 transition hover:border-(--ui-primary) hover:bg-(--ui-bg-muted)"
            >
              <UIcon :name="action.icon" class="size-5 text-(--ui-primary)" />
              <h3 class="mt-3 font-medium text-(--ui-text-highlighted)">{{ action.label }}</h3>
              <p class="mt-1 text-sm text-(--ui-text-muted)">{{ action.description }}</p>
            </NuxtLink>
          </div>
        </section>

        <aside class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-6">
          <h2 class="text-lg font-semibold text-(--ui-text-highlighted)">Google Business</h2>
          <div class="mt-4 space-y-4 text-sm">
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
            <div v-if="location.maps_url">
              <UButton :to="location.maps_url" target="_blank" color="neutral" variant="soft" block icon="i-heroicons-map">
                Open Maps
              </UButton>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
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

const locationAddress = computed(() =>
  location.value?.address?.addressLines?.join(', ') || ''
)

const publicLocationUrl = computed(() => {
  if (!site.value?.public_url || !location.value?.slug) return ''
  return `${site.value.public_url.replace(/\/$/, '')}/locations/${location.value.slug}`
})

const locationTabs = computed(() => [
  {
    label: 'Overview',
    icon: 'i-heroicons-home',
    active: true,
    to: `/dashboard/sites/${siteId}/locations/${locationId}`
  },
  {
    label: 'Content',
    icon: 'i-heroicons-document-text',
    active: false,
    to: `/dashboard/sites/${siteId}/content?locationId=${locationId}&page=location`
  },
  {
    label: 'Menu',
    icon: 'i-heroicons-list-bullet',
    active: false,
    to: `/dashboard/sites/${siteId}/menu?locationId=${locationId}`
  },
  {
    label: 'Details',
    icon: 'i-heroicons-map-pin',
    active: false,
    to: `/dashboard/sites/${siteId}/settings?tab=locations&locationId=${locationId}`
  },
  {
    label: 'Google Business',
    icon: 'i-heroicons-link',
    active: false,
    to: `/dashboard/sites/${siteId}/settings?tab=integrations&locationId=${locationId}`
  }
])

const workspaceActions = computed(() => [
  {
    label: 'Location Content',
    description: 'Edit the local page, hours, address, and contact copy.',
    icon: 'i-heroicons-document-text',
    to: `/dashboard/sites/${siteId}/content?locationId=${locationId}&page=location`
  },
  {
    label: 'Location Menu',
    description: 'Manage menu items scoped to this location.',
    icon: 'i-heroicons-list-bullet',
    to: `/dashboard/sites/${siteId}/menu?locationId=${locationId}`
  },
  {
    label: 'Location Settings',
    description: 'Update address, phone, photos, and primary status.',
    icon: 'i-heroicons-cog-6-tooth',
    to: `/dashboard/sites/${siteId}/settings?tab=locations&locationId=${locationId}`
  },
  {
    label: 'Brand Content',
    description: 'Edit site-wide copy shared across every location.',
    icon: 'i-heroicons-building-storefront',
    to: `/dashboard/sites/${siteId}/content`
  }
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
