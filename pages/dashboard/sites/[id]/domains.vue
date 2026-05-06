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
              Domains
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
        <p class="mt-2 text-stone-600">Loading domains...</p>
      </div>

      <!-- Domains Content -->
      <div v-else-if="site" class="space-y-8">
        <!-- Site Info -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h2 class="text-lg font-semibold text-stone-900 mb-4">Site Information</h2>
          <div class="text-sm text-stone-600">
            <p>Site: {{ site.name }}</p>
            <p>Organization: {{ site.organization_id }}</p>
          </div>
        </div>

        <!-- System Subdomain -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h3 class="text-lg font-semibold text-stone-900 mb-4">Free Subdomain</h3>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-stone-900">
                  {{ systemDomain?.domain }}
                </div>
                <div class="text-sm text-stone-600">
                  Status: <span class="text-green-600">Active</span>
                </div>
              </div>
              <div class="text-sm text-stone-500">
                System managed
              </div>
            </div>
          </div>
        </div>

        <!-- Custom Domains -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-lg font-semibold text-stone-900">Custom Domains</h3>
            <div v-if="!hasCustomDomainsEntitlement" class="text-sm text-stone-600">
              <NuxtLink
                to="/dashboard/billing"
                class="text-blue-600 hover:text-blue-800 font-medium"
              >
                Upgrade to add custom domains →
              </NuxtLink>
            </div>
          </div>

          <!-- Entitlement Check -->
          <div v-if="!hasCustomDomainsEntitlement" class="bg-stone-50 border border-stone-200 rounded-lg p-6 mb-6">
            <div class="flex items-start">
              <div class="flex-shrink-0">
                <svg class="w-5 h-5 text-stone-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                </svg>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-stone-900">Custom Domains Required</h3>
                <div class="mt-2 text-sm text-stone-600">
                  <p>Custom domains are available on paid plans. Upgrade your plan to add custom domains to your site.</p>
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

          <!-- Custom Domains List -->
          <div v-if="hasCustomDomainsEntitlement" class="space-y-4">
            <!-- Add Custom Domain -->
            <div class="border-2 border-dashed border-stone-300 rounded-lg p-6">
              <h4 class="text-sm font-medium text-stone-900 mb-4">Add Custom Domain</h4>
              <form @submit.prevent="addDomain" class="space-y-4">
                <div>
                  <label for="domain" class="block text-sm font-medium text-stone-700 mb-2">
                    Domain Name
                  </label>
                  <input
                    id="domain"
                    v-model="newDomain"
                    type="text"
                    :disabled="addingDomain"
                    class="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent disabled:opacity-50"
                    placeholder="example.com"
                  />
                  <p class="mt-1 text-xs text-stone-500">
                    Enter your custom domain name (e.g., restaurant.com)
                  </p>
                </div>
                
                <button
                  type="submit"
                  :disabled="addingDomain || !newDomain.trim()"
                  class="w-full bg-stone-900 text-white py-2 rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span v-if="addingDomain" class="flex items-center justify-center">
                    <svg class="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Adding Domain...
                  </span>
                  <span v-else>Add Domain</span>
                </button>
              </form>
            </div>

            <!-- Existing Custom Domains -->
            <div v-if="customDomains.length > 0" class="space-y-4">
              <div
                v-for="domain in customDomains"
                :key="domain.id"
                class="border border-stone-200 rounded-lg p-6"
              >
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h4 class="font-medium text-stone-900">{{ domain.domain }}</h4>
                    <div class="flex items-center space-x-2 mt-1">
                      <span
                        :class="[
                          'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                          getStatusClass(domain.status)
                        ]"
                      >
                        {{ getStatusText(domain.status) }}
                      </span>
                      <span class="text-xs text-stone-500">
                        Added {{ formatDate(domain.created_at) }}
                      </span>
                    </div>
                  </div>
                  
                  <button
                    v-if="domain.type === 'custom' && domain.status !== 'active'"
                    @click="deleteDomain(domain.id)"
                    :disabled="deletingDomain === domain.id"
                    class="text-red-600 hover:text-red-800 text-sm"
                  >
                    {{ deletingDomain === domain.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>

                <!-- DNS Verification Instructions -->
                <div v-if="domain.status === 'pending' || domain.status === 'failed'" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h5 class="text-sm font-medium text-yellow-800 mb-2">DNS Verification Required</h5>
                  <div class="text-sm text-yellow-700 space-y-2">
                    <p>To verify ownership of {{ domain.domain }}, add this DNS record:</p>
                    <div class="bg-white rounded border border-yellow-300 p-3 font-mono text-xs">
                      <div><strong>Type:</strong> TXT</div>
                      <div><strong>Name:</strong> _thaiclawai.{{ domain.domain }}</div>
                      <div><strong>Value:</strong> {{ domain.verification_token }}</div>
                    </div>
                    <p class="text-xs text-yellow-600">
                      DNS records may take a few minutes to propagate. After adding the record, click "Verify DNS" below.
                    </p>
                  </div>
                  
                  <div class="mt-4 flex space-x-2">
                    <button
                      @click="verifyDomain(domain.id)"
                      :disabled="verifyingDomain === domain.id"
                      class="inline-flex items-center px-3 py-2 border border-yellow-300 text-sm font-medium rounded-md text-yellow-800 bg-yellow-50 hover:bg-yellow-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span v-if="verifyingDomain === domain.id" class="flex items-center">
                        <svg class="animate-spin -ml-1 mr-2 h-3 w-3 text-yellow-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Verifying...
                      </span>
                      <span v-else>Verify DNS</span>
                    </button>
                    <button
                      @click="deleteDomain(domain.id)"
                      :disabled="deletingDomain === domain.id"
                      class="inline-flex items-center px-3 py-2 border border-stone-300 text-sm font-medium rounded-md text-stone-700 bg-white hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {{ deletingDomain === domain.id ? 'Deleting...' : 'Delete' }}
                    </button>
                  </div>
                </div>

                <!-- Active Domain -->
                <div v-if="domain.status === 'active'" class="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h5 class="text-sm font-medium text-green-800 mb-2">Domain Active</h5>
                  <p class="text-sm text-green-700">
                    Your custom domain {{ domain.domain }} is active and pointing to your site.
                  </p>
                  <p class="text-xs text-green-600 mt-2">
                    Verified on {{ formatDate(domain.verified_at) }}
                  </p>
                </div>

                <!-- Error Message -->
                <div v-if="domain.status === 'failed' && domain.error_message" class="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h5 class="text-sm font-medium text-red-800 mb-2">Verification Failed</h5>
                  <p class="text-sm text-red-700">{{ domain.error_message }}</p>
                </div>
              </div>
            </div>

            <!-- No Custom Domains -->
            <div v-else-if="!addingDomain" class="text-center py-8 text-stone-500">
              <svg class="mx-auto h-12 w-12 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9 9m9-9H3m9 9a9 9 0 01-9 9m9-9c-2.5 0-4.8-1.1-6.3-2.9"></path>
              </svg>
              <p class="mt-2">No custom domains added yet</p>
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
const { user, sessionLoading } = useAuth()
const hasLoaded = ref(false)

// State
const loading = ref(true)
const site = ref(null)
const domains = ref([])
const hasCustomDomainsEntitlement = ref(false)

// Form state
const newDomain = ref('')
const addingDomain = ref(false)
const verifyingDomain = ref(null)
const deletingDomain = ref(null)

// Message state
const successMessage = ref('')
const errorMessage = ref('')

// Computed
const siteId = computed(() => route.params.id)
const systemDomain = computed(() => domains.value.find(d => d.type === 'subdomain'))
const customDomains = computed(() => domains.value.filter(d => d.type === 'custom'))

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

// Load site and domains data (no auth check)
async function loadData() {
  loading.value = true
  try {
    // Get site details
    const siteResponse = await $fetch(`/api/sites/${siteId.value}`)
    site.value = siteResponse

    // Get domains
    const domainsResponse = await $fetch(`/api/sites/${siteId.value}/domains`)
    domains.value = domainsResponse.domains

    // Check custom domains entitlement
    const billingResponse = await $fetch('/api/billing/status')
    hasCustomDomainsEntitlement.value = billingResponse.billing.entitlements.custom_domains || false
  } catch (error) {
    console.error('Failed to load data:', error)
    errorMessage.value = 'Failed to load site data'
  } finally {
    loading.value = false
  }
}

// Add new domain
async function addDomain() {
  if (addingDomain.value || !newDomain.value.trim()) return
  
  addingDomain.value = true
  successMessage.value = ''
  errorMessage.value = ''
  
  try {
    const response = await $fetch(`/api/sites/${siteId.value}/domains`, {
      method: 'POST',
      body: {
        domain: newDomain.value.trim()
      }
    })
    
    if (response.success) {
      successMessage.value = response.message
      newDomain.value = ''
      await loadData() // Reload domains
    } else {
      errorMessage.value = response.error || 'Failed to add domain'
    }
  } catch (error) {
    console.error('Failed to add domain:', error)
    errorMessage.value = 'Failed to add domain. Please try again.'
  } finally {
    addingDomain.value = false
  }
}

// Verify domain
async function verifyDomain(domainId) {
  if (verifyingDomain.value) return
  
  verifyingDomain.value = domainId
  successMessage.value = ''
  errorMessage.value = ''
  
  try {
    const response = await $fetch(`/api/sites/${siteId.value}/domains/${domainId}/verify`, {
      method: 'POST'
    })
    
    if (response.success) {
      successMessage.value = response.message
      await loadData() // Reload domains
    } else {
      errorMessage.value = response.error || 'Verification failed'
    }
  } catch (error) {
    console.error('Failed to verify domain:', error)
    errorMessage.value = 'Failed to verify domain. Please try again.'
  } finally {
    verifyingDomain.value = null
  }
}

// Delete domain
async function deleteDomain(domainId) {
  if (deletingDomain.value) return
  
  if (!confirm('Are you sure you want to delete this custom domain?')) return
  
  deletingDomain.value = domainId
  successMessage.value = ''
  errorMessage.value = ''
  
  try {
    const response = await $fetch(`/api/sites/${siteId.value}/domains/${domainId}`, {
      method: 'DELETE'
    })
    
    if (response.success) {
      successMessage.value = response.message
      await loadData() // Reload domains
    } else {
      errorMessage.value = response.error || 'Failed to delete domain'
    }
  } catch (error) {
    console.error('Failed to delete domain:', error)
    errorMessage.value = 'Failed to delete domain. Please try again.'
  } finally {
    deletingDomain.value = null
  }
}

// Helper functions
function getStatusText(status) {
  switch (status) {
    case 'pending': return 'Pending Verification'
    case 'verifying': return 'Verifying'
    case 'active': return 'Active'
    case 'failed': return 'Verification Failed'
    case 'disabled': return 'Disabled'
    default: return 'Unknown'
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800'
    case 'pending': return 'bg-yellow-100 text-yellow-800'
    case 'verifying': return 'bg-blue-100 text-blue-800'
    case 'failed': return 'bg-red-100 text-red-800'
    case 'disabled': return 'bg-stone-100 text-stone-800'
    default: return 'bg-stone-100 text-stone-800'
  }
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Load data on mount
onMounted(() => {
  loadData()
})
</script>
