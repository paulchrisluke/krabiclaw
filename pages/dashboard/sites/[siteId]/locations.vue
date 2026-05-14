<template>
  <UPage>
    <UPageHeader
      title="Locations"
      :description="site ? `Physical locations for ${site.brand_name || 'this website'}` : 'Physical locations for this website.'"
      :links="headerLinks"
    />

    <UPageBody>
      <div v-if="loading">
        <div class="overflow-hidden rounded-lg border border-default">
          <div v-for="i in 3" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-4 last:border-0">
            <USkeleton class="h-4 w-40" />
            <USkeleton class="h-4 w-24" />
            <USkeleton class="ml-auto h-4 w-20" />
          </div>
        </div>
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :description="error"
      />

      <div v-else class="space-y-4">
        <!-- Empty state -->
        <div v-if="locations.length === 0 && !showAddLocationForm" class="rounded-lg border border-default px-6 py-16 text-center">
          <UIcon name="i-heroicons-map-pin" class="mx-auto size-10 text-muted" />
          <h2 class="mt-4 text-base font-semibold text-highlighted">Add your first location</h2>
          <p class="mt-1 text-sm text-muted">Local content, menus, hours, and Google Business mapping start here.</p>
          <UButton class="mt-5" icon="i-heroicons-plus" color="primary" @click="showAddLocationForm = true">Add Location</UButton>
        </div>

        <!-- Location list -->
        <div v-else-if="locations.length > 0" class="overflow-hidden rounded-lg border border-default">
          <template v-for="location in locations" :key="location.id">
            <!-- Row: collapsed -->
            <div
              v-if="expandedLocationId !== location.id"
              class="flex items-center gap-4 border-b border-default px-4 py-3.5 last:border-0"
            >
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-highlighted">{{ location.title }}</span>
                  <UBadge v-if="location.is_primary" color="primary" variant="soft" size="xs">Primary</UBadge>
                  <UBadge :color="location.status === 'active' ? 'success' : 'neutral'" variant="soft" size="xs">
                    {{ location.status }}
                  </UBadge>
                </div>
                <p class="mt-0.5 text-sm text-muted">
                  {{ addressLabel(location) || location.city || 'No address set' }}
                  <span v-if="location.phone"> · {{ location.phone }}</span>
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UButton
                  :to="`/dashboard/sites/${siteId}/menu?locationId=${location.id}`"
                  color="neutral"
                  variant="outline"
                  size="xs"
                >
                  Edit menu
                </UButton>
                <UButton
                  :to="`/dashboard/sites/${siteId}/content?locationId=${location.id}&page=location`"
                  color="neutral"
                  variant="outline"
                  size="xs"
                >
                  Edit content
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-pencil-square"
                  aria-label="Edit location"
                  @click="openEditLocation(location)"
                />
              </div>
            </div>

            <!-- Row: expanded inline edit -->
            <div v-else class="border-b border-default bg-elevated px-4 py-4 last:border-0">
              <div class="space-y-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="Name">
                    <UInput v-model="locationEditForm.title" placeholder="Kikuzuki Thonglor" autofocus />
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
                    @update:model-value="setLocationActive"
                  />
                </div>
                <div class="flex items-center justify-between gap-2">
                  <UButton
                    color="neutral" variant="ghost" size="sm" icon="i-heroicons-trash"
                    :loading="locationSaving"
                    @click="handleDeleteLocation(location.id)"
                  >Delete</UButton>
                  <div class="flex gap-2">
                    <UButton color="neutral" variant="ghost" size="sm" @click="expandedLocationId = null">Cancel</UButton>
                    <UButton size="sm" :loading="locationSaving" @click="handleSaveLocation(location.id)">Save</UButton>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Add Location form -->
        <div v-if="showAddLocationForm" class="overflow-hidden rounded-lg border border-default bg-elevated p-4">
          <h3 class="mb-4 text-sm font-semibold text-highlighted">New location</h3>
          <div class="space-y-4">
            <!-- Google Places search -->
            <UFormField label="Search Google Places" hint="Optional — auto-fill from Google">
              <UInput
                v-model="placesQuery"
                placeholder="Search your restaurant on Google…"
                icon="i-heroicons-magnifying-glass"
                :loading="placesSearching"
                autofocus
                @input="onPlacesInput"
              />
              <div v-if="placesResults.length" class="mt-1 overflow-hidden rounded-md border border-default bg-default shadow-sm">
                <button
                  v-for="result in placesResults"
                  :key="result.placeId"
                  type="button"
                  class="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-elevated"
                  @click="selectPlace(result.placeId)"
                >
                  <span class="font-medium text-highlighted">{{ result.name }}</span>
                  <span class="text-xs text-muted">{{ result.formattedAddress }}</span>
                </button>
              </div>
            </UFormField>

            <div v-if="placesQuery && !placesResults.length && !placesSearching" class="flex items-center gap-1.5">
              <div class="h-px flex-1 bg-default" />
              <span class="text-xs text-muted">or fill in manually</span>
              <div class="h-px flex-1 bg-default" />
            </div>
            <div v-else-if="!placesQuery" class="flex items-center gap-1.5">
              <div class="h-px flex-1 bg-default" />
              <span class="text-xs text-muted">or fill in manually</span>
              <div class="h-px flex-1 bg-default" />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Name">
                <UInput v-model="addLocationForm.title" placeholder="Kikuzuki Thonglor" />
              </UFormField>
              <UFormField label="City">
                <UInput v-model="addLocationForm.city" placeholder="Bangkok" />
              </UFormField>
            </div>
            <UFormField label="Phone">
              <UInput v-model="addLocationForm.phone" type="tel" placeholder="+66 2 123 4567" />
            </UFormField>
            <UFormField v-if="addLocationForm.address" label="Address">
              <UInput :model-value="addLocationForm.address" disabled />
            </UFormField>
            <UCheckbox v-model="addLocationForm.is_primary" label="Set as primary location" />
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" size="sm" @click="cancelAddLocation">Cancel</UButton>
              <UButton size="sm" color="primary" :loading="locationSaving" :disabled="!addLocationForm.title.trim()" @click="handleCreateLocation">
                Add location
              </UButton>
            </div>
          </div>
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
const site = ref<ApiRecord | null>(null)
const locations = ref<BusinessLocation[]>([])
const locationSaving = ref(false)
const addressLabel = (location: BusinessLocation) => location.address?.addressLines?.join(', ') || ''

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const message = (data as Record<string, unknown>).message
      if (typeof message === 'string' && message) return message
    }
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

const headerLinks = computed(() => [
  { label: 'Add location', icon: 'i-heroicons-plus', color: 'primary' as const, onClick: () => { showAddLocationForm.value = true } }
])

const setLocationActive = (v: boolean | 'indeterminate') => {
  if (v === 'indeterminate') {
    // indeterminate means no change — leave status unchanged
    return
  }
  locationEditForm.status = v ? 'active' : 'inactive'
}

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
    const idx = locations.value.findIndex((l: BusinessLocation) => l.id === id)
    if (idx !== -1) locations.value[idx] = response.location
    expandedLocationId.value = null
    toast.add({ description: 'Location saved', color: 'success' })
  } catch (err) {
    toast.add({ description: getErrorMessage(err instanceof Error ? err : new Error(String(err)), 'Failed to save location'), color: 'error' })
  } finally {
    locationSaving.value = false
  }
}

const handleDeleteLocation = async (id: string) => {
  locationSaving.value = true
  try {
    await $fetch(`/api/sites/${siteId}/locations/${id}`, { method: 'DELETE' })
    locations.value = locations.value.filter((l: BusinessLocation) => l.id !== id)
    expandedLocationId.value = null
    toast.add({ description: 'Location deleted', color: 'neutral' })
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to delete location'), color: 'error' })
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
  address: '',
  maps_url: '',
  website_url: '',
  opening_hours: null as string[] | null,
  is_primary: false,
  _placeId: '',
})

// Google Places autocomplete
interface PlaceSearchResult {
  placeId: string
  name: string
  formattedAddress: string
}

const placesQuery = ref('')
const placesResults = ref<PlaceSearchResult[]>([])
const placesSearching = ref(false)
let placesDebounceTimer: ReturnType<typeof setTimeout> | null = null

const onPlacesInput = () => {
  placesResults.value = []
  if (placesDebounceTimer) clearTimeout(placesDebounceTimer)
  const q = placesQuery.value.trim()
  if (q.length < 2) return
  placesDebounceTimer = setTimeout(() => doPlacesSearch(q), 400)
}

const doPlacesSearch = async (query: string) => {
  placesSearching.value = true
  try {
    const response = await $fetch<{ success: boolean; results: PlaceSearchResult[] }>(
      '/api/places/search',
      { method: 'POST', body: { query } } as ApiValue
    )
    if (response.success) placesResults.value = response.results
  } catch {
    // silently ignore — user can still fill in manually
  } finally {
    placesSearching.value = false
  }
}

const selectPlace = async (placeId: string) => {
  placesResults.value = []
  placesSearching.value = true
  try {
    const response = await $fetch<{ success: boolean; details: ApiValue }>(`/api/places/${placeId}`)
    if (!response.success) return
    const d = response.details
    addLocationForm.title = d.name || addLocationForm.title
    addLocationForm.city = d.city || addLocationForm.city
    addLocationForm.phone = d.phone || addLocationForm.phone
    addLocationForm.address = d.formattedAddress || ''
    addLocationForm.maps_url = d.mapsUrl || ''
    addLocationForm.website_url = d.websiteUrl || ''
    addLocationForm.opening_hours = d.openingHours || null
    addLocationForm._placeId = placeId
    placesQuery.value = d.name || ''
  } catch {
    toast.add({ description: 'Could not load place details', color: 'error' })
  } finally {
    placesSearching.value = false
  }
}

const cancelAddLocation = () => {
  showAddLocationForm.value = false
  placesQuery.value = ''
  placesResults.value = []
  addLocationForm.title = ''
  addLocationForm.city = ''
  addLocationForm.phone = ''
  addLocationForm.address = ''
  addLocationForm.maps_url = ''
  addLocationForm.website_url = ''
  addLocationForm.opening_hours = null
  addLocationForm._placeId = ''
  addLocationForm.is_primary = false
}

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
          city: addLocationForm.city.trim() || null,
          phone: addLocationForm.phone.trim() || null,
          address: addLocationForm.address ? { addressLines: [addLocationForm.address] } : undefined,
          maps_url: addLocationForm.maps_url || null,
          website_url: addLocationForm.website_url || null,
          opening_hours: addLocationForm.opening_hours ? { weekdayDescriptions: addLocationForm.opening_hours } : undefined,
          is_primary: addLocationForm.is_primary,
        }
      } as ApiValue
    )
    if (!response.success) throw new Error('Failed to create location')
    locations.value.push(response.location)
    cancelAddLocation()
    toast.add({ description: 'Location added', color: 'success' })
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to create location'), color: 'error' })
  } finally {
    locationSaving.value = false
  }
}

const loadLocationsWorkspace = async () => {
  loading.value = true
  error.value = null
  try {
    const [settingsResponse, locationsResponse] = await Promise.all([
      $fetch<ApiRecord>(`/api/sites/${siteId}/settings`),
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
