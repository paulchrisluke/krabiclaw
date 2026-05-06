<template>
  <div class="min-h-screen bg-stone-50">
    <!-- Dashboard Header -->
    <div class="bg-white border-b border-stone-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center">
            <NuxtLink
              to="/dashboard"
              class="text-stone-600 hover:text-stone-900 mr-4"
            >
              ← Dashboard
            </NuxtLink>
            <NuxtLink
              :to="`/dashboard/sites/${siteId}`"
              class="text-stone-600 hover:text-stone-900 mr-4"
            >
              ← Site
            </NuxtLink>
            <h1 class="text-xl font-semibold text-stone-900">
              Google Business Integration
            </h1>
          </div>
          <div class="flex items-center space-x-4">
            <span class="text-sm text-stone-600">
              {{ user?.email }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-stone-900"></div>
        <p class="mt-2 text-stone-600">Loading integration...</p>
      </div>

      <!-- Integration Content -->
      <div v-else-if="site" class="space-y-8">
        <!-- Site Info -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h2 class="text-lg font-semibold text-stone-900 mb-4">Site Information</h2>
          <div class="text-sm text-stone-600">
            <p>Site: {{ site.name }}</p>
            <p>Organization: {{ site.organization_id }}</p>
          </div>
        </div>

        <!-- Entitlement Check -->
        <div v-if="!hasGoogleBusinessEntitlement" class="bg-stone-50 border border-stone-200 rounded-lg p-6">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <svg class="w-5 h-5 text-stone-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
              </svg>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-stone-900">Google Business Integration Required</h3>
              <div class="mt-2 text-sm text-stone-600">
                <p>Google Business Profile integration is available on paid plans. Upgrade your plan to connect your Google Business Profile and import locations.</p>
              </div>
              <div class="mt-4">
                <NuxtLink
                  to="/dashboard/billing"
                  class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-stone-700 bg-stone-100 hover:bg-stone-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500"
                >
                  Upgrade Plan
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>

        <!-- Google Business Integration -->
        <div v-if="hasGoogleBusinessEntitlement" class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h3 class="text-lg font-semibold text-stone-900 mb-6">Google Business Profile</h3>

          <!-- Connection Status -->
          <div v-if="connection" class="mb-6">
            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
              <div class="flex items-start">
                <div class="flex-shrink-0">
                  <svg class="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                  </svg>
                </div>
                <div class="ml-3">
                  <h4 class="text-sm font-medium text-green-800">Connected to Google Business</h4>
                  <p class="text-sm text-green-700 mt-1">
                    Account: {{ connection.providerAccountEmail }}
                  </p>
                  <p class="text-xs text-green-600 mt-1">
                    Connected on {{ formatDate(connection.connectedAt) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Connect Button -->
          <div v-if="!connection" class="mb-6">
            <div class="text-center">
              <svg class="mx-auto h-12 w-12 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <h3 class="mt-2 text-lg font-medium text-stone-900">Connect Google Business Profile</h3>
              <p class="mt-1 text-sm text-stone-500">
                Connect your Google Business Profile to import locations and sync data
              </p>
              <button
                @click="connectGoogleBusiness"
                :disabled="connecting"
                class="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span v-if="connecting" class="flex items-center justify-center">
                  <svg class="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </span>
                <span v-else>Connect Google Business</span>
              </button>
            </div>
          </div>

          <!-- Location Import -->
          <div v-if="connection && !showLocationPicker" class="mb-6">
            <button
              @click="loadAccounts"
              :disabled="loadingAccounts"
              class="w-full bg-stone-900 text-white py-2 px-4 rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="loadingAccounts" class="flex items-center justify-center">
                <svg class="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading Accounts...
              </span>
              <span v-else>Import Locations</span>
            </button>
          </div>

          <!-- Location Picker -->
          <div v-if="showLocationPicker && accounts.length > 0" class="space-y-6">
            <h4 class="text-md font-medium text-stone-900">Select Locations to Import</h4>
            
            <div v-for="account in accounts" :key="account.name" class="border border-stone-200 rounded-lg p-4">
              <h5 class="font-medium text-stone-900 mb-3">{{ account.accountName }}</h5>
              
              <div v-if="account.locations.length === 0" class="text-sm text-stone-500">
                No locations found in this account
              </div>
              
              <div v-else class="space-y-2">
                <label
                  v-for="location in account.locations"
                  :key="location.name"
                  class="flex items-center p-3 border border-stone-200 rounded-lg hover:bg-stone-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :value="location.name"
                    v-model="selectedLocations"
                    class="mr-3 h-4 w-4 text-stone-600 focus:ring-stone-500 border-stone-300 rounded"
                  />
                  <div class="flex-1">
                    <div class="font-medium text-stone-900">{{ location.title }}</div>
                    <div v-if="location.address" class="text-sm text-stone-600">
                      {{ formatAddress(location.address) }}
                    </div>
                    <div v-if="location.rating" class="text-sm text-stone-500">
                      Rating: {{ location.rating }} ({{ location.reviewCount }} reviews)
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Sync Button -->
            <div class="flex space-x-4">
              <button
                @click="syncLocations"
                :disabled="syncing || selectedLocations.length === 0"
                class="flex-1 bg-stone-900 text-white py-2 px-4 rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span v-if="syncing" class="flex items-center justify-center">
                  <svg class="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Syncing...
                </span>
                <span v-else>Sync {{ selectedLocations.length }} Location(s)</span>
              </button>
              <button
                @click="showLocationPicker = false"
                class="flex-1 bg-stone-100 text-stone-900 py-2 px-4 rounded-lg hover:bg-stone-200"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Imported Locations -->
          <div v-if="locations.length > 0" class="mt-8">
            <h4 class="text-md font-medium text-stone-900 mb-4">Imported Locations ({{ locations.length }})</h4>
            <div class="space-y-3">
              <div
                v-for="location in locations"
                :key="location.id"
                class="flex items-center justify-between p-4 border border-stone-200 rounded-lg"
              >
                <div>
                  <div class="font-medium text-stone-900">
                    {{ location.title }}
                    <span v-if="location.is_primary" class="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Primary
                    </span>
                  </div>
                  <div v-if="location.address" class="text-sm text-stone-600">
                    {{ formatAddress(JSON.parse(location.address)) }}
                  </div>
                  <div class="text-xs text-stone-500 mt-1">
                    Last synced: {{ formatDate(location.last_synced_at) }}
                  </div>
                </div>
                <div class="flex items-center space-x-2">
                  <button
                    @click="refreshLocation(location.id)"
                    :disabled="refreshing === location.id"
                    class="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    {{ refreshing === location.id ? 'Refreshing...' : 'Refresh' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Success/Error Messages -->
        <div v-if="successMessage" class="bg-green-50 border border-green-200 rounded-lg p-4">
          <p class="text-green-800">{{ successMessage }}</p>
        </div>
        
        <div v-if="errorMessage" class="bg-red-50 border border-red-200 rounded-lg p-4">
          <p class="text-red-800">{{ errorMessage }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'admin',
  auth: true
})

const router = useRouter()
const route = useRoute()

// State
const loading = ref(true)
const site = ref(null)
const connection = ref(null)
const accounts = ref([])
const locations = ref([])
const hasGoogleBusinessEntitlement = ref(false)
const user = ref(null)

// Form state
const connecting = ref(false)
const loadingAccounts = ref(false)
const showLocationPicker = ref(false)
const selectedLocations = ref([])
const syncing = ref(false)
const refreshing = ref(null)

// Message state
const successMessage = ref('')
const errorMessage = ref('')

// Computed
const siteId = computed(() => route.params.id)

// Load site and integration data
async function loadData() {
  try {
    const auth = await useAuth()
    user.value = auth.user
    

    const router = useRouter()
    const route = useRoute()
    const { user, sessionLoading } = useAuth()
    const hasLoaded = ref(false)

    // State
    const loading = ref(true)
    const site = ref(null)
    const connection = ref(null)
    const accounts = ref([])
    const locations = ref([])
    const hasGoogleBusinessEntitlement = ref(false)

    // Form state
    const connecting = ref(false)
    const loadingAccounts = ref(false)
    const showLocationPicker = ref(false)
    const selectedLocations = ref([])
    const syncing = ref(false)
    const refreshing = ref(null)

    // Message state
    const successMessage = ref('')
    const errorMessage = ref('')

    // Computed
    const siteId = computed(() => route.params.id)

    watch([
      user,
      sessionLoading
    ], async ([currentUser, loadingSession]) => {
      if (loadingSession) return
      if (!currentUser) {
        await router.push('/login')
        return
      }
      if (hasLoaded.value) return
      hasLoaded.value = true
      await loadData()
    }, { immediate: true })

    // Load site and integration data (no auth check)
    async function loadData() {
      loading.value = true
      try {
        // Get site details
        const siteResponse = await $fetch(`/api/sites/${siteId.value}`)
        site.value = siteResponse

        // Check Google Business entitlement
        const billingResponse = await $fetch('/api/billing/status')
        hasGoogleBusinessEntitlement.value = billingResponse.billing.entitlements.google_business || false

        // Get Google Business connection
        const connectionResponse = await $fetch(`/api/sites/${siteId.value}/google-business/connection`)
        connection.value = connectionResponse.connection

        // Get imported locations
        const locationsResponse = await $fetch(`/api/sites/${siteId.value}/locations`)
        locations.value = locationsResponse.locations
      } catch (error) {
        console.error('Failed to load data:', error)
        errorMessage.value = 'Failed to load integration data'
      } finally {
        loading.value = false
      }
    }
    console.error('Failed to connect Google Business:', error)
    errorMessage.value = 'Failed to connect Google Business. Please try again.'
  } finally {
    connecting.value = false
  }
}

// Load Google Business accounts and locations
async function loadAccounts() {
  if (loadingAccounts.value) return
  
  loadingAccounts.value = true
  successMessage.value = ''
  errorMessage.value = ''
  
  try {
    const response = await $fetch(`/api/integrations/google-business/accounts`)
    accounts.value = response.accounts || []
    showLocationPicker.value = true
    selectedLocations.value = []
  } catch (error) {
    console.error('Failed to load accounts:', error)
    errorMessage.value = 'Failed to load Google Business accounts'
  } finally {
    loadingAccounts.value = false
  }
}

// Sync selected locations
async function syncLocations() {
  if (syncing.value || selectedLocations.value.length === 0) return
  
  syncing.value = true
  successMessage.value = ''
  errorMessage.value = ''
  
  try {
    // Find the account that contains the selected locations
    let accountId = null
    for (const account of accounts.value) {
      const hasSelectedLocation = account.locations.some(loc => 
        selectedLocations.value.includes(loc.name)
      )
      if (hasSelectedLocation) {
        accountId = account.name
        break
      }
    }

    if (!accountId) {
      errorMessage.value = 'Could not determine account for selected locations'
      return
    }

    const response = await $fetch(`/api/integrations/google-business/locations/sync`, {
      method: 'POST',
      body: {
        locationIds: selectedLocations.value,
        accountId
      }
    })
    
    if (response.success) {
      successMessage.value = response.message
      showLocationPicker.value = false
      selectedLocations.value = []
      
      // Reload locations
      const locationsResponse = await $fetch(`/api/sites/${siteId.value}/locations`)
      locations.value = locationsResponse.locations || []
    } else {
      errorMessage.value = response.error || 'Failed to sync locations'
    }
  } catch (error) {
    console.error('Failed to sync locations:', error)
    errorMessage.value = 'Failed to sync locations. Please try again.'
  } finally {
    syncing.value = false
  }
}

// Refresh individual location
async function refreshLocation(locationId) {
  if (refreshing.value) return
  
  refreshing.value = locationId
  
  try {
    // This would be a refresh endpoint - for now just reload all locations
    const locationsResponse = await $fetch(`/api/sites/${siteId.value}/locations`)
    locations.value = locationsResponse.locations || []
  } catch (error) {
    console.error('Failed to refresh location:', error)
  } finally {
    refreshing.value = null
  }
}

// Helper functions
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

function formatDate(dateString) {
  if (!dateString) return 'Unknown'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Load data on mount
onMounted(() => {
  loadData()
})
</script>
