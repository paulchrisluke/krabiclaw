<template>
  <div class="min-h-screen bg-stone-50">
    <!-- Site Header -->
    <UHeader>
      <template #left>
        <div class="flex items-center space-x-4">
          <UButton
            to="/dashboard"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-heroicons-arrow-left"
          >
            Dashboard
          </UButton>
          <h1 class="text-xl font-semibold text-stone-900">
            {{ site?.name || 'Loading...' }}
          </h1>
        </div>
      </template>
      <template #right>
        <UButton
          :href="`https://${site?.subdomain}.krabiclaw.com`"
          target="_blank"
          variant="outline"
          size="sm"
        >
          View Live Site
        </UButton>
      </template>
    </UHeader>

    <!-- Main Content -->
    <UContainer class="py-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <USkeleton class="h-8 w-8 mx-auto mb-4" />
        <p class="text-stone-600">Loading site...</p>
      </div>

      <!-- Site Content -->
      <div v-else-if="site" class="space-y-8">
        <!-- Site Info -->
        <UCard>
          <h2 class="text-lg font-semibold text-stone-900 mb-4">Site Information</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p class="text-sm text-stone-600">Restaurant Name</p>
              <p class="font-medium text-stone-900">{{ site.name }}</p>
            </div>
            <div>
              <p class="text-sm text-stone-600">Website Address</p>
              <p class="font-medium text-stone-900">{{ site.subdomain }}.krabiclaw.com</p>
            </div>
            <div>
              <p class="text-sm text-stone-600">Theme</p>
              <p class="font-medium text-stone-900">Saya</p>
            </div>
            <div>
              <p class="text-sm text-stone-600">Plan</p>
              <p class="font-medium text-stone-900">{{ site.plan === 'free' ? 'Free Plan' : 'Premium Plan' }}</p>
            </div>
          </div>
        </UCard>

        <!-- Quick Actions -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h2 class="text-lg font-semibold text-stone-900 mb-4">Quick Actions</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              @click="editContent"
              class="flex items-center justify-center px-4 py-3 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
              Edit Content
            </button>
            <button
              @click="manageMenu"
              class="flex items-center justify-center px-4 py-3 border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50 transition-colors"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
              Manage Menu
            </button>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h2 class="text-lg font-semibold text-stone-900 mb-4">Getting Started</h2>
          <div class="space-y-4">
            <div class="flex items-center">
              <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                </svg>
              </div>
              <div>
                <p class="font-medium text-stone-900">Site Created</p>
                <p class="text-sm text-stone-600">Your restaurant website is ready</p>
              </div>
            </div>
            
            <div class="flex items-center">
              <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
              </div>
              <div>
                <p class="font-medium text-stone-900">Customize Content</p>
                <p class="text-sm text-stone-600">Edit your restaurant information and hours</p>
              </div>
            </div>
            
            <div class="flex items-center">
              <div class="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center mr-3">
                <svg class="w-4 h-4 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
              </div>
              <div>
                <p class="font-medium text-stone-900">Update Menu</p>
                <p class="text-sm text-stone-600">Add your restaurant's menu items and prices</p>
              </div>
            </div>
            
            <div class="flex items-center">
              <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9 9m9-9H3m9 9a9 9 0 01-9 9m9-9c-2.5 0-4.8-1.1-6.3-2.9"></path>
                </svg>
              </div>
              <div>
                <p class="font-medium text-stone-900">Manage Domains</p>
                <p class="text-sm text-stone-600">Configure custom domains and DNS settings</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Onboarding Status Alert -->
        <div v-if="site.onboarding_status === 'pending' || site.onboarding_status === 'failed'" class="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <svg class="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
              </svg>
            </div>
            <div class="ml-3 flex-1">
              <h3 class="text-lg font-medium text-yellow-800">
                {{ site.onboarding_status === 'failed' ? 'Site Setup Failed' : 'Site Setup In Progress' }}
              </h3>
              <div class="mt-2 text-sm text-yellow-700">
                <p v-if="site.onboarding_status === 'failed'">
                  Your site setup encountered an error. You can retry the setup process.
                </p>
                <p v-else>
                  Your site is being set up. This usually takes a few seconds.
                </p>
              </div>
              <div class="mt-4">
                <button
                  @click="retryOnboarding"
                  :disabled="retrying"
                  class="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg v-if="retrying" class="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {{ retrying ? 'Retrying...' : 'Retry Setup' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Upgrade Prompt (for free plans) -->
        <div v-if="site.plan === 'free' && site.onboarding_status === 'active'" class="bg-gradient-to-r from-stone-600 to-stone-800 rounded-lg p-6 text-white">
          <h2 class="text-lg font-semibold mb-2">Upgrade to Premium</h2>
          <p class="mb-4 text-stone-200">
            Unlock custom domains, Google Business integration, and advanced features.
          </p>
          <button class="bg-white text-stone-900 px-4 py-2 rounded-lg font-medium hover:bg-stone-100 transition-colors">
            Learn More
          </button>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'admin'
})

const router = useRouter()
const route = useRoute()

// State
const loading = ref(true)
const site = ref(null)
const retrying = ref(false)

// Load site data
async function loadSiteData() {
  try {
    const siteId = route.params.id
    
    if (!siteId) {
      await router.push('/dashboard')
      return
    }

    // Get user session for authorization
    const auth = await useAuth()
    if (!auth.user) {
      await router.push('/login')
      return
    }

    // Get site details
    const siteData = await $fetch(`/api/sites/${siteId}`)
    site.value = siteData

    // Verify user owns this site
    if (!site.value || !auth.organizations?.some(org => org.id === site.value.organization_id)) {
      await router.push('/dashboard')
      return
    }
  } catch (error) {
    console.error('Failed to load site:', error)
    await router.push('/dashboard')
  } finally {
    loading.value = false
  }
}

// Action handlers
function editContent() {
  router.push(`/dashboard/sites/${route.params.id}/content`)
}

function manageMenu() {
  router.push(`/dashboard/sites/${route.params.id}/menu`)
}

// Retry onboarding for failed/incomplete sites
async function retryOnboarding() {
  if (retrying.value) return
  
  retrying.value = true
  
  try {
    const response = await $fetch('/api/onboarding/retry-site', {
      method: 'POST',
      body: {
        siteId: route.params.id
      }
    })
    
    // Reload site data to show updated status
    await loadSiteData()
  } catch (error) {
    console.error('Failed to retry onboarding:', error)
    alert('Failed to retry site setup. Please try again.')
  } finally {
    retrying.value = false
  }
}

// Load data on mount
onMounted(() => {
  loadSiteData()
})
</script>
