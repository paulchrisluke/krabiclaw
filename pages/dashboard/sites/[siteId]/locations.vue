<template>
  <UPage>
    <UPageHeader
      title="Locations"
      :description="site ? `Physical locations for ${site.name}` : 'Physical locations for this website.'"
      :links="[
        { label: 'Add Location', icon: 'i-heroicons-plus', to: `/dashboard/sites/${siteId}/settings?tab=locations` },
        { label: 'Brand Content', icon: 'i-heroicons-document-text', to: `/dashboard/sites/${siteId}/content`, color: 'neutral', variant: 'soft' }
      ]"
    />

    <UPageBody>
      <UCard v-if="loading">
        <div class="flex items-center gap-3 text-sm text-(--ui-text-muted)">
          <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
          Loading locations...
        </div>
      </UCard>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :description="error"
      />

      <div v-else class="space-y-6">
        <div class="grid gap-4 md:grid-cols-3">
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Locations</p>
            <p class="mt-2 text-3xl font-semibold text-(--ui-text-highlighted)">{{ locations.length }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Primary</p>
            <p class="mt-2 truncate text-3xl font-semibold text-(--ui-text-highlighted)">{{ primaryLocation?.title || 'None' }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">URL structure</p>
            <p class="mt-2 text-lg font-semibold text-(--ui-text-highlighted)">{{ site?.url_structure === 'brand_pages' ? 'Brand pages' : 'Location paths' }}</p>
          </UCard>
        </div>

        <UCard v-if="locations.length === 0">
          <div class="mx-auto max-w-md py-10 text-center">
            <UIcon name="i-heroicons-map-pin" class="mx-auto size-10 text-(--ui-text-muted)" />
            <h2 class="mt-4 text-xl font-semibold text-(--ui-text-highlighted)">Add your first location</h2>
            <p class="mt-2 text-sm text-(--ui-text-muted)">Local content, menus, hours, and Google Business mapping start here.</p>
            <UButton class="mt-6" :to="`/dashboard/sites/${siteId}/settings?tab=locations`" icon="i-heroicons-plus">
              Add Location
            </UButton>
          </div>
        </UCard>

        <div v-else class="grid gap-4 lg:grid-cols-2">
          <UCard
            v-for="location in locations"
            :key="location.id"
          >
            <div class="flex h-full flex-col">
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
                <UIcon name="i-heroicons-map-pin" class="mt-1 size-5 shrink-0 text-(--ui-text-muted)" />
              </div>

              <div class="mt-5 space-y-2">
                <UButton :to="`/dashboard/sites/${siteId}/menu?locationId=${location.id}`" icon="i-heroicons-list-bullet" block>
                  Edit Menu
                </UButton>
                <div class="grid gap-2 sm:grid-cols-2">
                  <UButton :to="`/dashboard/sites/${siteId}/content?locationId=${location.id}&page=location`" icon="i-heroicons-document-text" color="neutral" variant="soft" size="sm">
                    Content
                  </UButton>
                  <UButton :to="`/dashboard/sites/${siteId}/settings?tab=locations&locationId=${location.id}`" icon="i-heroicons-cog-6-tooth" color="neutral" variant="soft" size="sm">
                    Details
                  </UButton>
                </div>
              </div>
            </div>
          </UCard>
        </div>
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
  is_primary: boolean
  status: string
}

const route = useRoute()
const siteId = route.params.siteId as string

const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<any>(null)
const locations = ref<BusinessLocation[]>([])

const primaryLocation = computed(() => locations.value.find(location => location.is_primary) || null)
const addressLabel = (location: BusinessLocation) => location.address?.addressLines?.join(', ') || ''

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
