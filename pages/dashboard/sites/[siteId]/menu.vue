<template>
  <UPage>
    <UPageHeader title="Menu">
      <template #description>
        <div v-if="loading" class="flex items-center gap-2">
          <USkeleton class="h-5 w-32" />
        </div>
        <div v-else-if="locations.length > 1" class="flex items-center gap-2">
          <UIcon name="i-heroicons-map-pin" class="size-4 shrink-0 text-(--ui-text-muted)" />
          <USelect
            :model-value="locationId"
            :items="locationSelectItems"
            size="sm"
            class="w-48"
            @update:model-value="handleLocationChange"
          />
        </div>
        <div v-else-if="selectedLocation" class="flex items-center gap-1.5 text-(--ui-text-muted)">
          <UIcon name="i-heroicons-map-pin" class="size-4 shrink-0" />
          <span>{{ selectedLocation.title }}</span>
        </div>
      </template>
      <template #links>
        <UButton
          v-for="link in headerLinks"
          :key="link.label"
          v-bind="link"
        />
      </template>
    </UPageHeader>

    <UPageBody>
      <div v-if="loading" class="space-y-4">
        <USkeleton class="h-10 w-56" />
        <USkeleton class="h-48 w-full" />
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
          <UButton class="mt-6" :to="`/dashboard/sites/${siteId}/locations`" icon="i-heroicons-plus">
            Add Location
          </UButton>
        </div>
      </UCard>

      <div v-else-if="selectedLocation">
        <MenuEditor
          :key="selectedLocation.id"
          :site-id="siteId"
          :location-id="selectedLocation.id"
        />
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

const selectedLocation = computed(() => locations.value.find((location: BusinessLocation) => location.id === locationId.value) || null)

const locationSelectItems = computed(() =>
  locations.value.map((location: BusinessLocation) => ({
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
watch(locations, (locs: BusinessLocation[]) => {
  if (locs.length > 0 && !locationId.value) {
    const primary = locs.find((l: BusinessLocation) => l.is_primary) || locs[0]
    if (primary) {
      router.replace({ query: { locationId: primary.id } })
    }
  }
}, { immediate: true })

useSeoMeta({ title: 'Menu | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
