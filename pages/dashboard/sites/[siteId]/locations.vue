<template>
  <div class="space-y-8">
    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <NuxtLink :to="`/dashboard/sites/${siteId}`" class="inline-flex items-center gap-2 text-sm text-(--ui-text-muted) hover:text-(--ui-text)">
          <UIcon name="i-heroicons-arrow-left" class="size-4" />
          Site dashboard
        </NuxtLink>
        <h1 class="mt-3 text-3xl font-bold text-(--ui-text-highlighted)">Locations</h1>
        <p class="mt-2 text-(--ui-text-muted)">Manage the physical places that belong to this site.</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton
          :to="`/dashboard/sites/${siteId}/settings?tab=locations`"
          icon="i-heroicons-plus"
        >
          Add Location
        </UButton>
        <UButton
          :to="`/dashboard/sites/${siteId}/content`"
          color="neutral"
          variant="soft"
          icon="i-heroicons-document-text"
        >
          Brand Content
        </UButton>
      </div>
    </div>

    <div v-if="loading" class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-8 text-center text-sm text-(--ui-text-muted)">
      Loading locations...
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :description="error"
    />

    <div v-else class="space-y-4">
      <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-5">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-sm font-medium text-(--ui-text-highlighted)">{{ site?.name || 'Site' }}</p>
            <p class="text-sm text-(--ui-text-muted)">{{ locations.length }} active location{{ locations.length === 1 ? '' : 's' }}</p>
          </div>
          <UBadge color="neutral" variant="soft">{{ site?.url_structure === 'brand_pages' ? 'Brand pages' : 'Location subdirectories' }}</UBadge>
        </div>
      </div>

      <div v-if="locations.length === 0" class="rounded-lg border border-dashed border-(--ui-border) bg-(--ui-bg) p-10 text-center">
        <UIcon name="i-heroicons-map-pin" class="mx-auto size-8 text-(--ui-text-muted)" />
        <h2 class="mt-3 text-lg font-semibold text-(--ui-text-highlighted)">No locations yet</h2>
        <p class="mt-1 text-sm text-(--ui-text-muted)">Create the first location to unlock location-specific content and menus.</p>
        <UButton class="mt-5" :to="`/dashboard/sites/${siteId}/settings?tab=locations`" icon="i-heroicons-plus">
          Add Location
        </UButton>
      </div>

      <div v-else class="grid gap-4 lg:grid-cols-2">
        <NuxtLink
          v-for="location in locations"
          :key="location.id"
          :to="`/dashboard/sites/${siteId}/locations/${location.id}`"
          class="group rounded-lg border border-(--ui-border) bg-(--ui-bg) p-5 transition hover:border-(--ui-primary) hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-lg font-semibold text-(--ui-text-highlighted)">{{ location.title }}</h2>
                <UBadge v-if="location.is_primary" color="primary" variant="soft">Primary</UBadge>
                <UBadge :color="location.status === 'active' ? 'success' : 'warning'" variant="soft">{{ location.status }}</UBadge>
              </div>
              <p class="mt-2 text-sm text-(--ui-text-muted)">{{ addressLabel(location) || location.city || 'No address set' }}</p>
              <p v-if="location.phone" class="mt-1 text-sm text-(--ui-text-muted)">{{ location.phone }}</p>
            </div>
            <UIcon name="i-heroicons-arrow-right" class="mt-1 size-5 shrink-0 text-(--ui-text-muted) transition group-hover:text-(--ui-primary)" />
          </div>
        </NuxtLink>
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
  is_primary: boolean
  status: string
}

const route = useRoute()
const siteId = route.params.siteId as string

const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<any>(null)
const locations = ref<BusinessLocation[]>([])

const addressLabel = (location: BusinessLocation) =>
  location.address?.addressLines?.join(', ') || ''

const loadLocationsWorkspace = async () => {
  loading.value = true
  error.value = null
  try {
    const [settingsResponse, locationsResponse] = await Promise.all([
      $fetch<any>(`/api/sites/${siteId}/settings`),
      $fetch<{ success: boolean; locations: BusinessLocation[] }>(`/api/sites/${siteId}/locations`)
    ])

    if (!settingsResponse.success) throw new Error('Failed to load site settings')
    if (!locationsResponse.success) throw new Error('Failed to load locations')

    site.value = settingsResponse.settings
    locations.value = locationsResponse.locations
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load locations'
  } finally {
    loading.value = false
  }
}

onMounted(loadLocationsWorkspace)

useSeoMeta({ title: 'Locations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
