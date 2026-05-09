<template>
  <UPage>
    <UPageHeader
      title="Locations"
      :description="site ? `Physical locations for ${site.name}` : 'Physical locations for this website.'"
    />

    <UPageBody>
      <!-- Loading state -->
      <div v-if="loading" class="space-y-4">
        <div class="grid gap-4 md:grid-cols-3">
          <USkeleton class="h-20" />
          <USkeleton class="h-20" />
          <USkeleton class="h-20" />
        </div>
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

      <div v-else class="space-y-6">
        <!-- Stats row -->
        <div class="grid gap-4 md:grid-cols-3">
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Locations</p>
            <p class="mt-2 text-3xl font-semibold text-(--ui-text-highlighted)">{{ locations.length }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Primary</p>
            <p class="mt-2 truncate text-3xl font-semibold text-(--ui-text-highlighted)">
              {{ primaryLocation?.title || 'None' }}
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">URL structure</p>
            <p class="mt-2 text-lg font-semibold text-(--ui-text-highlighted)">
              {{ site?.url_structure === 'brand_pages' ? 'Brand pages' : 'Location paths' }}
            </p>
          </UCard>
        </div>

        <!-- Empty state -->
        <UCard v-if="locations.length === 0 && !showAddLocationForm">
          <div class="mx-auto max-w-md py-10 text-center">
            <UIcon name="i-heroicons-map-pin" class="mx-auto size-10 text-(--ui-text-muted)" />
            <h2 class="mt-4 text-xl font-semibold text-(--ui-text-highlighted)">Add your first location</h2>
            <p class="mt-2 text-sm text-(--ui-text-muted)">
              Local content, menus, hours, and Google Business mapping start here.
            </p>
            <UButton class="mt-6" icon="i-heroicons-plus" @click="showAddLocationForm = true">
              Add Location
            </UButton>
          </div>
        </UCard>

        <!-- Location cards -->
        <div v-else class="grid gap-4 lg:grid-cols-2">
          <UCard
            v-for="location in locations"
            :key="location.id"
          >
            <div class="flex h-full flex-col">
              <!-- Collapsed view -->
              <template v-if="expandedLocationId !== location.id">
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="truncate text-lg font-semibold text-(--ui-text-highlighted)">{{ location.title }}</h2>
                      <UBadge v-if="location.is_primary" color="primary" variant="soft">Primary</UBadge>
                      <UBadge :color="location.status === 'active' ? 'success' : 'warning'" variant="soft">
                        {{ location.status }}
                      </UBadge>
                    </div>
                    <p class="mt-2 text-sm text-(--ui-text-muted)">
                      {{ addressLabel(location) || location.city || 'No address set' }}
                    </p>
                    <p v-if="location.phone" class="mt-1 text-sm text-(--ui-text-muted)">{{ location.phone }}</p>
                  </div>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    icon="i-heroicons-pencil-square"
                    aria-label="Edit location"
                    @click="openEditLocation(location)"
                  />
                </div>

                <div class="mt-5 space-y-2">
                  <UButton
                    :to="`/dashboard/sites/${siteId}/menu?locationId=${location.id}`"
                    icon="i-heroicons-list-bullet"
                    block
                  >
                    Edit Menu
                  </UButton>
                  <UButton
                    :to="`/dashboard/sites/${siteId}/content?locationId=${location.id}&page=location`"
                    icon="i-heroicons-document-text"
                    color="neutral"
                    variant="soft"
                    block
                  >
                    Edit Content
                  </UButton>
                </div>
              </template>

              <!-- Expanded inline edit form -->
              <template v-else>
                <h3 class="mb-4 font-semibold text-(--ui-text-highlighted)">Edit Location</h3>
                <div class="space-y-4">
                  <div class="grid gap-4 sm:grid-cols-2">
                    <UFormField label="Name">
                      <UInput v-model="locationEditForm.title" placeholder="Kikuzuki Thonglor" />
                    </UFormField>
                    <UFormField label="City">
                      <UInput v-model="locationEditForm.city" placeholder="Bangkok" />
                    </UFormField>
                  </div>
                  <UFormField label="Phone">
                    <UInput v-model="locationEditForm.phone" type="tel" placeholder="+66 2 123 4567" />
                  </UFormField>
                  <div class="flex items-center gap-6">
                    <UCheckbox v-model="locationEditForm.is_primary" label="Primary location" />
                    <UCheckbox
                      :model-value="locationEditForm.status === 'active'"
                      label="Active"
                      @update:model-value="locationEditForm.status = $event ? 'active' : 'inactive'"
                    />
                  </div>
                  <div class="flex items-center justify-between gap-2 pt-1">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      icon="i-heroicons-trash"
                      :loading="locationSaving"
                      @click="handleDeleteLocation(location.id)"
                    >
                      Delete
                    </UButton>
                    <div class="flex gap-2">
                      <UButton color="neutral" variant="ghost" size="sm" @click="expandedLocationId = null">
                        Cancel
                      </UButton>
                      <UButton size="sm" :loading="locationSaving" @click="handleSaveLocation(location.id)">
                        Save
                      </UButton>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </UCard>
        </div>

        <!-- Add Location inline form -->
        <UCard v-if="showAddLocationForm">
          <template #header>
            <h2 class="font-semibold text-(--ui-text-highlighted)">New Location</h2>
          </template>
          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Name">
                <UInput v-model="addLocationForm.title" placeholder="Kikuzuki Thonglor" autofocus />
              </UFormField>
              <UFormField label="City">
                <UInput v-model="addLocationForm.city" placeholder="Bangkok" />
              </UFormField>
            </div>
            <UFormField label="Phone">
              <UInput v-model="addLocationForm.phone" type="tel" placeholder="+66 2 123 4567" />
            </UFormField>
            <UCheckbox v-model="addLocationForm.is_primary" label="Set as primary location" />
            <div class="flex justify-end gap-2 pt-1">
              <UButton color="neutral" variant="ghost" @click="showAddLocationForm = false">Cancel</UButton>
              <UButton
                :loading="locationSaving"
                :disabled="!addLocationForm.title.trim()"
                @click="handleCreateLocation"
              >
                Add Location
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Add Location trigger (when locations exist and form not shown) -->
        <div v-if="locations.length > 0 && !showAddLocationForm" class="flex justify-center">
          <UButton color="neutral" variant="soft" icon="i-heroicons-plus" @click="showAddLocationForm = true">
            Add Location
          </UButton>
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
const toast = useToast()

const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<any>(null)
const locations = ref<BusinessLocation[]>([])
const locationSaving = ref(false)

const primaryLocation = computed(() => locations.value.find(l => l.is_primary) || null)
const addressLabel = (location: BusinessLocation) => location.address?.addressLines?.join(', ') || ''

const generateSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

// Inline edit state
const expandedLocationId = ref<string | null>(null)
const locationEditForm = reactive({
  title: '',
  city: '',
  phone: '',
  is_primary: false,
  status: 'active'
})

const openEditLocation = (location: BusinessLocation) => {
  expandedLocationId.value = location.id
  locationEditForm.title = location.title
  locationEditForm.city = location.city ?? ''
  locationEditForm.phone = location.phone ?? ''
  locationEditForm.is_primary = location.is_primary
  locationEditForm.status = location.status
}

const handleSaveLocation = async (id: string) => {
  locationSaving.value = true
  try {
    const response = await $fetch<{ success: boolean; location: BusinessLocation }>(
      `/api/sites/${siteId}/locations/${id}`,
      { method: 'PATCH', body: { ...locationEditForm } }
    )
    if (!response.success) throw new Error('Failed to save location')
    const idx = locations.value.findIndex(l => l.id === id)
    if (idx !== -1) locations.value[idx] = response.location
    expandedLocationId.value = null
    toast.add({ description: 'Location saved', color: 'success' })
  } catch (err: any) {
    toast.add({ description: err.data?.message || 'Failed to save location', color: 'error' })
  } finally {
    locationSaving.value = false
  }
}

const handleDeleteLocation = async (id: string) => {
  locationSaving.value = true
  try {
    await $fetch(`/api/sites/${siteId}/locations/${id}`, { method: 'DELETE' })
    locations.value = locations.value.filter(l => l.id !== id)
    expandedLocationId.value = null
    toast.add({ description: 'Location deleted', color: 'neutral' })
  } catch (err: any) {
    toast.add({ description: err.data?.message || 'Failed to delete location', color: 'error' })
  } finally {
    locationSaving.value = false
  }
}

// Add location inline form
const showAddLocationForm = ref(false)
const addLocationForm = reactive({
  title: '',
  city: '',
  phone: '',
  is_primary: false
})

const handleCreateLocation = async () => {
  if (!addLocationForm.title.trim()) return
  locationSaving.value = true
  try {
    const response = await $fetch<{ success: boolean; location: BusinessLocation }>(
      `/api/sites/${siteId}/locations`,
      {
        method: 'POST',
        body: {
          title: addLocationForm.title.trim(),
          slug: generateSlug(addLocationForm.title),
          city: addLocationForm.city.trim(),
          phone: addLocationForm.phone.trim(),
          is_primary: addLocationForm.is_primary
        }
      }
    )
    if (!response.success) throw new Error('Failed to create location')
    locations.value.push(response.location)
    addLocationForm.title = ''
    addLocationForm.city = ''
    addLocationForm.phone = ''
    addLocationForm.is_primary = false
    showAddLocationForm.value = false
    toast.add({ description: 'Location added', color: 'success' })
  } catch (err: any) {
    toast.add({ description: err.data?.message || 'Failed to create location', color: 'error' })
  } finally {
    locationSaving.value = false
  }
}

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
