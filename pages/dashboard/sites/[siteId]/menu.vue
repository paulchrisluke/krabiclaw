<template>
  <UPage>
    <UPageHeader
      title="Menu"
      :description="selectedLocation ? `Menu for ${selectedLocation.title}` : 'Choose a location before editing local menus.'"
      :links="headerLinks"
    />

    <UPageBody>
      <div v-if="loading" class="space-y-4">
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-48 w-full" />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :description="error"
      />

      <UCard v-else-if="locations.length === 0">
        <div class="mx-auto max-w-md py-10 text-center">
          <UIcon name="i-heroicons-map-pin" class="mx-auto size-10 text-(--ui-text-muted)" />
          <h2 class="mt-4 text-xl font-semibold text-(--ui-text-highlighted)">Add a location first</h2>
          <p class="mt-2 text-sm text-(--ui-text-muted)">Menus are managed per physical location.</p>
          <UButton class="mt-6" :to="`/dashboard/sites/${siteId}/settings?tab=locations`" icon="i-heroicons-plus">
            Add Location
          </UButton>
        </div>
      </UCard>

      <div v-else-if="!selectedLocation" class="grid gap-4 lg:grid-cols-2">
        <UCard
          v-for="location in locations"
          :key="location.id"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-lg font-semibold text-(--ui-text-highlighted)">{{ location.title }}</h2>
                <UBadge v-if="location.is_primary" color="primary" variant="soft">Primary</UBadge>
              </div>
              <p class="mt-2 text-sm text-(--ui-text-muted)">{{ addressLabel(location) || location.city || 'No address set' }}</p>
            </div>
          </div>

          <UButton
            class="mt-5"
            :to="{ path: `/dashboard/sites/${siteId}/menu`, query: { locationId: location.id } }"
            icon="i-heroicons-list-bullet"
            block
          >
            Edit Menu
          </UButton>
        </UCard>
      </div>

      <div v-else class="space-y-4">
        <UCard>
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="font-medium text-(--ui-text-highlighted)">{{ selectedLocation.title }}</p>
              <p class="mt-1 text-sm text-(--ui-text-muted)">{{ addressLabel(selectedLocation) || selectedLocation.city || 'No address set' }}</p>
            </div>
            <UButton :to="`/dashboard/sites/${siteId}/locations/${selectedLocation.id}`" color="neutral" variant="soft" icon="i-heroicons-map-pin">
              Location Workspace
            </UButton>
          </div>
        </UCard>

        <MenuEditor :key="selectedLocation.id" :site-id="siteId" :location-id="selectedLocation.id" />
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
  is_primary: boolean
}

const route = useRoute()
const router = useRouter()
const siteId = typeof route.params.siteId === 'string' ? route.params.siteId : null
const locationId = computed(() => typeof route.query.locationId === 'string' ? route.query.locationId : null)

if (!siteId) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid site ID'
  })
}

const loading = ref(true)
const error = ref<string | null>(null)
const locations = ref<BusinessLocation[]>([])

const selectedLocation = computed(() => locations.value.find(location => location.id === locationId.value) || null)

const locationSelectItems = computed(() =>
  locations.value.map(location => ({
    value: location.id,
    label: location.is_primary ? `${location.title} (Primary)` : location.title
  }))
)

const handleLocationChange = (value: string) => {
  router.replace({ query: { locationId: value } })
}

const headerLinks = computed(() => [
  { label: 'Locations', icon: 'i-heroicons-map-pin', to: `/dashboard/sites/${siteId}/locations`, color: 'neutral' as const, variant: 'soft' as const },
  { label: 'Add Location', icon: 'i-heroicons-plus', to: `/dashboard/sites/${siteId}/settings?tab=locations`, color: 'neutral' as const, variant: 'soft' as const }
])

const addressLabel = (location: BusinessLocation) => location.address?.addressLines?.join(', ') || ''

const loadMenuWorkspace = async () => {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch<{ success: boolean; locations: BusinessLocation[] }>(`/api/sites/${siteId}/locations`)
    if (!response.success) throw new Error('Failed to load locations')
    locations.value = response.locations
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load menu workspace'
  } finally {
    loading.value = false
  }
}

onMounted(loadMenuWorkspace)

// Auto-select primary location on load
watch(locations, (locs) => {
  if (locs.length > 0 && !locationId.value) {
    const primary = locs.find(l => l.is_primary) || locs[0]
    if (primary) {
      router.replace({ query: { locationId: primary.id } })
    }
  }
}, { immediate: true })

useSeoMeta({ title: 'Menu | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
