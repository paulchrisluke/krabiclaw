<template>
  <div class="min-h-screen bg-stone-50">
    <!-- Tenant Header -->
    <UHeader class="bg-white border-b border-stone-200">
      <template #left>
        <h1 class="text-xl font-semibold text-stone-900">Our Locations</h1>
      </template>
    </UHeader>

    <!-- Main Content -->
    <UContainer class="py-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <USkeleton class="h-8 w-8 rounded-full mx-auto mb-2" />
        <p class="mt-2 text-stone-600">Loading locations...</p>
      </div>

      <!-- Locations Content -->
      <div v-else-if="locations.length > 0" class="space-y-8">
        <!-- Locations Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <UCard
            v-for="location in locations"
            :key="location.id"
            class="overflow-hidden hover:shadow-md transition-shadow"
          >
            <!-- Location Header -->
            <div class="p-6">
              <div class="flex items-start justify-between mb-4">
                <div>
                  <h3 class="text-lg font-semibold text-stone-900">
                    {{ location.title }}
                  </h3>
                  <div v-if="location.is_primary" class="mt-1">
                    <UBadge color="info" variant="soft" size="sm">
                      Primary Location
                    </UBadge>
                  </div>
                </div>
                
                <!-- Rating -->
                <div v-if="location.rating" class="text-right">
                  <div class="flex items-center">
                    <svg class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                    </svg>
                    <span class="ml-1 text-sm text-stone-600">{{ location.rating }}</span>
                  </div>
                  <p v-if="location.review_count" class="text-xs text-stone-500">
                    {{ location.review_count }} reviews
                  </p>
                </div>
              </div>

              <!-- Address -->
              <div v-if="location.address" class="mb-4">
                <p class="text-sm text-stone-600">
                  {{ formatAddress(location.address) }}
                </p>
              </div>

              <!-- Phone -->
              <div v-if="location.phone" class="mb-4">
                <a
                  :href="`tel:${location.phone}`"
                  class="text-sm text-blue-600 hover:text-blue-800"
                >
                  {{ location.phone }}
                </a>
              </div>

              <!-- Website -->
              <div v-if="location.website_url" class="mb-4">
                <a
                  :href="location.website_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-sm text-blue-600 hover:text-blue-800"
                >
                  Visit Website
                </a>
              </div>

              <!-- Hours -->
              <div v-if="location.opening_hours" class="mb-4">
                <p class="text-sm font-medium text-stone-700 mb-2">Hours:</p>
                <div class="text-xs text-stone-600">
                  <div v-for="(day, index) in formatHours(location.opening_hours)" :key="index" class="flex justify-between">
                    <span>{{ day.day }}</span>
                    <span>{{ day.hours }}</span>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex space-x-2">
                <UButton
                  :to="`/locations/${location.slug}`"
                  color="neutral"
                  size="sm"
                  block
                >
                  View Details
                </UButton>
                <UButton
                  :to="`/locations/${location.slug}/menu`"
                  variant="outline"
                  color="neutral"
                  size="sm"
                  block
                >
                  Menu
                </UButton>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- No Locations -->
      <UCard v-else class="text-center py-12">
        <UEmpty
          icon="i-heroicons-map-pin"
          description="This restaurant hasn't added any locations yet."
        />
      </UCard>
    </UContainer>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'tenant' })
// Get site context from tenant resolution
const { site } = useTenant()
const loading = ref(true)
const locations = ref([])

// Load locations
async function loadLocations() {
  if (!site.value) {
    loading.value = false
    return
  }

  try {
    const response = await $fetch(`/api/sites/${site.value.id}/locations`)
    locations.value = response.locations || []
  } catch (error) {
    console.error('Failed to load locations:', error)
    locations.value = []
  } finally {
    loading.value = false
  }
}

// Format address for display
function formatAddress(address) {
  if (!address) return ''
  
  const parts = [
    address.streetAddress,
    address.locality,
    address.region,
    address.postalCode
  ].filter(Boolean)
  
  return parts.join(', ')
}

// Format opening hours
function formatHours(hours) {
  if (!hours) return []
  
  // Handle different hour formats
  if (typeof hours === 'string') {
    try {
      hours = JSON.parse(hours)
    } catch {
      return []
    }
  }
  
  if (!hours.periods) return []
  
  return hours.periods.map(period => ({
    day: period.openDay || 'Unknown',
    hours: `${period.openTime || 'N/A'} - ${period.closeTime || 'N/A'}`
  }))
}

// Load on mount
onMounted(() => {
  loadLocations()
})
</script>
