<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-(--ui-text-highlighted)">Site Settings</h1>
        <p class="mt-2 text-(--ui-text-muted)">Manage site-wide settings, locations, SEO, and integrations.</p>
      </div>
      <UButton :to="`/dashboard/sites/${siteId}`" icon="i-heroicons-arrow-left" variant="ghost" color="neutral">
        Dashboard
      </UButton>
    </div>

    <div v-if="loading" class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-8 text-center text-(--ui-text-muted)">
      Loading settings...
    </div>

    <UAlert v-else-if="error" color="error" variant="soft" :description="error" />

    <div v-else-if="settings" class="space-y-6">
      <div class="flex flex-wrap gap-2 border-b border-(--ui-border)">
        <UButton
          v-for="tab in tabs"
          :key="tab.id"
          :icon="tab.icon"
          :variant="activeTab === tab.id ? 'soft' : 'ghost'"
          :color="activeTab === tab.id ? 'primary' : 'neutral'"
          class="rounded-b-none"
          @click="setActiveTab(tab.id)"
        >
          {{ tab.label }}
        </UButton>
      </div>

      <section v-if="activeTab === 'general'" class="space-y-6">
        <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-6">
          <h2 class="text-xl font-semibold text-(--ui-text-highlighted)">General</h2>
          <div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <UFormField label="Site Name">
              <UInput v-model="form.name" placeholder="Your restaurant name" />
            </UFormField>

            <UFormField label="Subdomain" help="Subdomain cannot be changed after creation.">
              <UInput :model-value="settings.subdomain" readonly />
            </UFormField>

            <UFormField label="Theme" help="Saya theme is currently the only option.">
              <UInput :model-value="settings.theme" readonly />
            </UFormField>

            <UFormField label="URL Structure">
              <USelect
                v-model="form.url_structure"
                :items="urlStructureOptions"
                value-key="value"
                label-key="label"
              />
            </UFormField>
          </div>

          <div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <UFormField label="Public URL">
              <div class="flex gap-2">
                <UInput :model-value="settings.public_url" readonly class="flex-1" />
                <UButton icon="i-heroicons-clipboard-document" variant="outline" color="neutral" aria-label="Copy URL" @click="copyToClipboard(settings.public_url)" />
              </div>
            </UFormField>

            <div>
              <p class="mb-2 block text-sm font-medium text-(--ui-text)">Status</p>
              <UBadge :color="settings.status === 'active' ? 'success' : 'warning'" variant="soft">
                {{ settings.status }}
              </UBadge>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-6">
          <h2 class="text-xl font-semibold text-(--ui-text-highlighted)">Brand Basics</h2>
          <div class="mt-6 space-y-6">
            <UFormField label="Restaurant/Brand Name" help="Displayed prominently on your website.">
              <UInput v-model="form.brand_name" placeholder="Your Restaurant Name" />
            </UFormField>

            <UFormField label="Short Description" help="Used for SEO and homepage content.">
              <UTextarea v-model="form.brand_description" :rows="3" placeholder="Authentic dining experience in your city" />
            </UFormField>

            <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
              <UFormField label="Logo URL">
                <UInput v-model="form.logo_url" type="url" placeholder="https://example.com/logo.png" />
              </UFormField>

              <UFormField label="Contact Email">
                <UInput v-model="form.contact_email" type="email" placeholder="contact@yourrestaurant.com" />
              </UFormField>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'locations'" class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold text-(--ui-text-highlighted)">Locations</h2>
              <p class="mt-1 text-sm text-(--ui-text-muted)">Each location can have its own address, hours, photos, menu, and Google Business connection.</p>
            </div>
            <UButton icon="i-heroicons-plus" @click="startNewLocation">Add</UButton>
          </div>

          <div v-if="locationsLoading" class="mt-6 text-sm text-(--ui-text-muted)">Loading locations...</div>
          <div v-else-if="locations.length === 0" class="mt-6 rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p class="text-sm font-medium text-(--ui-text-highlighted)">No locations yet</p>
            <p class="mt-1 text-sm text-(--ui-text-muted)">Add your first restaurant location to unlock location-specific content.</p>
          </div>
          <div v-else class="mt-6 divide-y divide-gray-100">
            <button
              v-for="location in locations"
              :key="location.id"
              type="button"
              class="flex w-full items-start justify-between gap-4 py-4 text-left"
              @click="editLocation(location)"
            >
              <span class="min-w-0">
                <span class="flex items-center gap-2">
                  <span class="truncate text-sm font-semibold text-(--ui-text-highlighted)">{{ location.title }}</span>
                  <UBadge v-if="location.is_primary" color="success" variant="soft" size="xs">Primary</UBadge>
                  <UBadge color="neutral" variant="subtle" size="xs">{{ location.status }}</UBadge>
                </span>
                <span class="mt-1 block truncate text-sm text-(--ui-text-muted)">/{{ location.slug }}</span>
                <span v-if="addressLabel(location)" class="mt-1 block truncate text-sm text-(--ui-text-muted)">{{ addressLabel(location) }}</span>
              </span>
              <UIcon name="i-heroicons-chevron-right-20-solid" class="mt-1 size-5 shrink-0 text-(--ui-text-dimmed)" />
            </button>
          </div>
        </div>

        <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-6">
          <h2 class="text-lg font-semibold text-(--ui-text-highlighted)">{{ editingLocationId ? 'Edit Location' : 'Add Location' }}</h2>
          <div class="mt-5 space-y-4">
            <UFormField label="Location Name">
              <UInput v-model="locationForm.title" placeholder="Kikuzuki Thonglor" />
            </UFormField>

            <UFormField label="Slug" help="Used for location URLs.">
              <UInput v-model="locationForm.slug" placeholder="thonglor" />
            </UFormField>

            <UFormField label="Address">
              <UTextarea v-model="locationForm.addressText" :rows="3" placeholder="Street, city, postal code" />
            </UFormField>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <UFormField label="City">
                <UInput v-model="locationForm.city" placeholder="Bangkok" />
              </UFormField>
              <UFormField label="Phone">
                <UInput v-model="locationForm.phone" placeholder="+66..." />
              </UFormField>
            </div>

            <UFormField label="Hours">
              <UTextarea v-model="locationForm.hoursText" :rows="3" placeholder="Mon-Sun: 11:00 AM - 10:00 PM" />
            </UFormField>

            <UFormField label="Image URL">
              <UInput v-model="locationForm.image_url" type="url" placeholder="https://example.com/location.jpg" />
            </UFormField>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <UFormField label="Website URL">
                <UInput v-model="locationForm.website_url" type="url" />
              </UFormField>
              <UFormField label="Maps URL">
                <UInput v-model="locationForm.maps_url" type="url" />
              </UFormField>
            </div>

            <UCheckbox v-model="locationForm.is_primary" label="Primary location" />

            <div class="flex gap-2">
              <UButton :loading="locationSaving" :disabled="locationSaving" class="flex-1 justify-center" @click="saveLocation">
                {{ editingLocationId ? 'Save Location' : 'Create Location' }}
              </UButton>
              <UButton v-if="editingLocationId" color="neutral" variant="outline" @click="startNewLocation">New</UButton>
            </div>

            <UButton
              v-if="editingLocationId"
              color="error"
              variant="ghost"
              block
              :loading="locationDeleting"
              :disabled="locationDeleting"
              @click="confirmDeleteLocation"
            >
              Delete Location
            </UButton>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'seo'" class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-6">
        <h2 class="text-xl font-semibold text-(--ui-text-highlighted)">SEO</h2>
        <p class="mt-2 text-sm text-(--ui-text-muted)">Global defaults use the brand basics above. Location pages use each location's name, address, and URL slug.</p>
        <div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="rounded-lg border border-(--ui-border) p-4">
            <p class="text-sm font-medium text-(--ui-text-highlighted)">Global defaults</p>
            <p class="mt-1 text-sm text-(--ui-text-muted)">{{ form.brand_name || form.name }}</p>
            <p class="mt-2 text-sm text-(--ui-text-muted)">{{ form.brand_description || 'Add a short description in General.' }}</p>
          </div>
          <div class="rounded-lg border border-(--ui-border) p-4">
            <p class="text-sm font-medium text-(--ui-text-highlighted)">Location overrides</p>
            <p class="mt-1 text-sm text-(--ui-text-muted)">{{ locations.length }} active location{{ locations.length === 1 ? '' : 's' }}</p>
            <p class="mt-2 text-sm text-(--ui-text-muted)">Use the Locations tab to control per-location titles and paths.</p>
          </div>
        </div>
      </section>

      <section v-else class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-6">
        <h2 class="text-xl font-semibold text-(--ui-text-highlighted)">Integrations</h2>
        <div class="mt-6 divide-y divide-gray-100">
          <div v-for="location in locations" :key="location.id" class="flex items-center justify-between gap-4 py-4">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-(--ui-text-highlighted)">{{ location.title }}</p>
              <p class="truncate text-sm text-(--ui-text-muted)">{{ location.google_location_id ? 'Google Business linked' : 'Google Business not linked' }}</p>
            </div>
            <UBadge :color="location.google_location_id ? 'success' : 'neutral'" variant="soft">
              {{ location.google_location_id ? 'Connected' : 'Manual' }}
            </UBadge>
          </div>
        </div>
      </section>

      <div class="flex items-center justify-end gap-3 border-t border-(--ui-border) pt-6">
        <UButton variant="outline" color="neutral" @click="resetForm">Reset</UButton>
        <UButton :loading="saving" :disabled="saving" @click="saveSettings">Save Settings</UButton>
      </div>
    </div>

    <AppToast />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

type SettingsTab = 'general' | 'locations' | 'seo' | 'integrations'

interface BusinessLocation {
  id: string
  slug: string
  title: string
  address: { addressLines?: string[] } | null
  city: string | null
  phone: string | null
  image_url: string | null
  website_url: string | null
  maps_url: string | null
  opening_hours: { text?: string } | null
  google_location_id?: string | null
  is_primary: boolean
  status: string
}

const route = useRoute()
const router = useRouter()
const siteId = route.params.siteId as string
const toast = useToast()

const tabs: Array<{ id: SettingsTab; label: string; icon: string }> = [
  { id: 'general', label: 'General', icon: 'i-heroicons-cog-6-tooth' },
  { id: 'locations', label: 'Locations', icon: 'i-heroicons-map-pin' },
  { id: 'seo', label: 'SEO', icon: 'i-heroicons-magnifying-glass' },
  { id: 'integrations', label: 'Integrations', icon: 'i-heroicons-link' }
]

const urlStructureOptions = [
  { label: 'Location subdirectories', value: 'location_subdirectories' },
  { label: 'Brand pages only', value: 'brand_pages' }
]

const tabFromQuery = (value: unknown): SettingsTab =>
  typeof value === 'string' && tabs.some(tab => tab.id === value)
    ? value as SettingsTab
    : 'general'

const activeTab = ref<SettingsTab>(tabFromQuery(route.query.tab))
const loading = ref(true)
const locationsLoading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const locationSaving = ref(false)
const locationDeleting = ref(false)
const settings = ref<any>(null)
const locations = ref<BusinessLocation[]>([])
const editingLocationId = ref<string | null>(null)

const form = reactive({
  name: '',
  brand_name: '',
  brand_description: '',
  logo_url: '',
  contact_email: '',
  primary_location_id: null as string | null,
  url_structure: 'location_subdirectories'
})

const locationForm = reactive({
  title: '',
  slug: '',
  addressText: '',
  city: '',
  phone: '',
  hoursText: '',
  image_url: '',
  website_url: '',
  maps_url: '',
  is_primary: false
})

const textFromAddress = (address: BusinessLocation['address']) =>
  address?.addressLines?.join('\n') || ''

const addressFromText = (value: string) =>
  value.trim() ? { addressLines: value.split('\n').map(line => line.trim()).filter(Boolean) } : null

const hoursFromText = (value: string) =>
  value.trim() ? { text: value.trim() } : null

const addressLabel = (location: BusinessLocation) =>
  location.address?.addressLines?.join(', ') || ''

const setActiveTab = (tab: SettingsTab) => {
  activeTab.value = tab
  router.replace({ query: { ...route.query, tab } })
}

const loadSettings = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch<any>(`/api/sites/${siteId}/settings`)
    if (!response.success) throw new Error('Failed to load settings')
    settings.value = response.settings
    resetForm()
    await loadLocations()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
}

const loadLocations = async () => {
  locationsLoading.value = true
  try {
    const response = await $fetch<{ success: boolean; locations: BusinessLocation[] }>(`/api/sites/${siteId}/locations`)
    if (!response.success) throw new Error('Failed to load locations')
    locations.value = response.locations
    const queryLocationId = route.query.locationId
    if (typeof queryLocationId === 'string') {
      const queryLocation = locations.value.find(location => location.id === queryLocationId)
      if (queryLocation) {
        activeTab.value = 'locations'
        editLocation(queryLocation)
      }
    }
  } catch (err) {
    toast.add({ description: err instanceof Error ? err.message : 'Failed to load locations', color: 'error' })
  } finally {
    locationsLoading.value = false
  }
}

const saveSettings = async () => {
  saving.value = true
  error.value = null

  try {
    const response = await $fetch<any>(`/api/sites/${siteId}/settings`, {
      method: 'PATCH',
      body: { ...form }
    })

    if (!response.success) throw new Error('Failed to save settings')
    settings.value = response.settings
    toast.add({ description: 'Settings saved', color: 'success' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

const resetForm = () => {
  if (!settings.value) return
  form.name = settings.value.name || ''
  form.brand_name = settings.value.brand_name || ''
  form.brand_description = settings.value.brand_description || ''
  form.logo_url = settings.value.logo_url || ''
  form.contact_email = settings.value.contact_email || ''
  form.primary_location_id = settings.value.primary_location_id || null
  form.url_structure = settings.value.url_structure || 'location_subdirectories'
}

const startNewLocation = () => {
  editingLocationId.value = null
  locationForm.title = ''
  locationForm.slug = ''
  locationForm.addressText = ''
  locationForm.city = ''
  locationForm.phone = ''
  locationForm.hoursText = ''
  locationForm.image_url = ''
  locationForm.website_url = ''
  locationForm.maps_url = ''
  locationForm.is_primary = locations.value.length === 0
}

const editLocation = (location: BusinessLocation) => {
  editingLocationId.value = location.id
  locationForm.title = location.title
  locationForm.slug = location.slug
  locationForm.addressText = textFromAddress(location.address)
  locationForm.city = location.city || ''
  locationForm.phone = location.phone || ''
  locationForm.hoursText = location.opening_hours?.text || ''
  locationForm.image_url = location.image_url || ''
  locationForm.website_url = location.website_url || ''
  locationForm.maps_url = location.maps_url || ''
  locationForm.is_primary = Boolean(location.is_primary)
}

const saveLocation = async () => {
  if (!locationForm.title.trim()) {
    toast.add({ description: 'Location name is required', color: 'error' })
    return
  }

  const trimmedSlug = locationForm.slug.trim()
  if (!trimmedSlug) {
    toast.add({ description: 'Location slug is required', color: 'error' })
    return
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
    toast.add({ description: 'Slug must contain only lowercase letters, numbers, and hyphens', color: 'error' })
    return
  }

  locationSaving.value = true
  try {
    const body = {
      title: locationForm.title,
      slug: trimmedSlug,
      address: addressFromText(locationForm.addressText),
      city: locationForm.city,
      phone: locationForm.phone,
      opening_hours: hoursFromText(locationForm.hoursText),
      image_url: locationForm.image_url,
      website_url: locationForm.website_url,
      maps_url: locationForm.maps_url,
      is_primary: locationForm.is_primary
    }

    const url = editingLocationId.value
      ? `/api/sites/${siteId}/locations/${editingLocationId.value}`
      : `/api/sites/${siteId}/locations`

    const response = await $fetch<any>(url, {
      method: editingLocationId.value ? 'PATCH' : 'POST',
      body
    })

    if (!response.success) throw new Error('Failed to save location')
    await loadLocations()
    if (response.location?.is_primary) form.primary_location_id = response.location.id
    editLocation(response.location)
    toast.add({ description: 'Location saved', color: 'success' })
  } catch (err) {
    toast.add({ description: err instanceof Error ? err.message : 'Failed to save location', color: 'error' })
  } finally {
    locationSaving.value = false
  }
}

const confirmDeleteLocation = () => {
  if (!editingLocationId.value) return
  if (!confirm(`Delete location "${locationForm.title}"? This cannot be undone.`)) return
  deleteLocation()
}

const deleteLocation = async () => {
  if (!editingLocationId.value) return
  locationDeleting.value = true
  try {
    const deletedId = editingLocationId.value
    const response = await $fetch<any>(`/api/sites/${siteId}/locations/${deletedId}`, {
      method: 'DELETE'
    })

    if (!response.success) throw new Error('Failed to delete location')
    await loadLocations()
    if (form.primary_location_id === deletedId) form.primary_location_id = null
    startNewLocation()
    toast.add({ description: 'Location deleted', color: 'info' })
  } catch (err) {
    toast.add({ description: err instanceof Error ? err.message : 'Failed to delete location', color: 'error' })
  } finally {
    locationDeleting.value = false
  }
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ description: 'URL copied', color: 'success' })
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
    toast.add({ description: 'Failed to copy URL', color: 'error' })
  }
}

onMounted(() => {
  loadSettings()
  startNewLocation()
})

useSeoMeta({ title: 'Site Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
