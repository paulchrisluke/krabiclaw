<template>
  <div class="min-h-screen bg-stone-50">
    <!-- Dashboard Header -->
    <UHeader class="bg-white border-b border-stone-200">
      <template #left>
        <h1 class="text-xl font-semibold text-stone-900">Dashboard</h1>
      </template>
      <template #right>
        <div class="flex items-center space-x-4">
          <span class="text-sm text-stone-600">
            {{ user?.email }}
          </span>
          <UButton
            @click="handleLogout"
            variant="ghost"
            color="stone"
            size="sm"
          >
            Sign out
          </UButton>
        </div>
      </template>
    </UHeader>

    <!-- Main Content -->
    <UContainer class="py-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <USkeleton class="h-8 w-8 rounded-full mx-auto mb-2" />
        <p class="mt-2 text-stone-600">Loading dashboard...</p>
      </div>

      <!-- Dashboard Content -->
      <div v-else class="space-y-8">
        <!-- Welcome Section -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h2 class="text-lg font-semibold text-stone-900 mb-2">Welcome to KrabiClaw</h2>
          <p class="text-stone-600">
            Manage your restaurant websites, domains, and integrations from this dashboard.
          </p>
        </div>

        <!-- Sites Overview -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-stone-900">Your Sites</h3>
            <NuxtLink
              to="/dashboard/sites/new"
              class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-stone-700 bg-stone-100 hover:bg-stone-200"
            >
              Create New Site
            </NuxtLink>
          </div>
          
          <div v-if="sites.length === 0" class="text-center py-8">
            <svg class="mx-auto h-12 w-12 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
            </svg>
            <h3 class="mt-2 text-lg font-medium text-stone-900">No sites yet</h3>
            <p class="mt-1 text-stone-500">Get started by creating your first restaurant website.</p>
            <div class="mt-6">
              <NuxtLink
                to="/dashboard/sites/new"
                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-stone-900 hover:bg-stone-800"
              >
                Create Your First Site
              </NuxtLink>
            </div>
          </div>
          
          <div v-else class="space-y-4">
            <div
              v-for="site in sites"
              :key="site.id"
              class="flex items-center justify-between p-4 border border-stone-200 rounded-lg hover:bg-stone-50"
            >
              <div>
                <h4 class="font-medium text-stone-900">{{ site.name }}</h4>
                <p class="text-sm text-stone-600">
                  {{ site.subdomain }}.krabiclaw.com
                </p>
                <div class="flex items-center space-x-2 mt-1">
                  <span
                    :class="[
                      'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                      site.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    ]"
                  >
                    {{ site.status === 'active' ? 'Active' : 'Pending' }}
                  </span>
                  <span
                    v-if="site.onboarding_status === 'active'"
                    class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    Ready
                  </span>
                </div>
              </div>
              
              <div class="flex items-center space-x-2">
                <NuxtLink
                  :to="`/dashboard/sites/${site.id}`"
                  class="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Manage
                </NuxtLink>
                <a
                  :href="`https://${site.subdomain}.krabiclaw.com`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-stone-600 hover:text-stone-800 text-sm"
                >
                  View
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h3 class="text-lg font-semibold text-stone-900 mb-4">Quick Actions</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink
              to="/dashboard/billing"
              class="block p-4 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
            >
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <svg class="w-6 h-6 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
                  </svg>
                </div>
                <div class="ml-3">
                  <p class="font-medium text-stone-900">Billing</p>
                  <p class="text-sm text-stone-600">Manage your subscription</p>
                </div>
              </div>
            </NuxtLink>
            
            <NuxtLink
              v-if="sites.length > 0"
              to="/dashboard/sites"
              class="block p-4 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
            >
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <svg class="w-6 h-6 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                  </svg>
                </div>
                <div class="ml-3">
                  <p class="font-medium text-stone-900">All Sites</p>
                  <p class="text-sm text-stone-600">View and manage sites</p>
                </div>
              </div>
            </NuxtLink>
            
            <div class="block p-4 border border-stone-200 rounded-lg">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <svg class="w-6 h-6 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <div class="ml-3">
                  <p class="font-medium text-stone-900">Help</p>
                  <p class="text-sm text-stone-600">Get support</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'
import { authClient } from '~/utils/auth-client'

definePageMeta({
  layout: 'dashboard',
  auth: true
})


const { data: sessionData, isPending: sessionLoading } = useAuth()
console.log('[dashboard] sessionData:', sessionData)
console.log('[dashboard] sessionLoading:', sessionLoading)
const user = computed(() => sessionData.value?.user)

// State
const dataLoading = ref(true)
const sites = ref([])

// Computed
const loading = computed(() => sessionLoading.value || dataLoading.value)

// Load sites data
async function loadSites() {
  try {
    if (!user.value && !sessionLoading.value) {
      await navigateTo('/login')
      return
    }

    const response = await $fetch('/api/sites')
    sites.value = response.sites || []
  } catch (error) {
    console.error('Failed to load sites:', error)
    sites.value = []
  } finally {
    dataLoading.value = false
  }
}

// Handle logout
async function handleLogout() {
  try {
    await authClient.signOut()
    navigateTo('/login')
  } catch (error) {
    console.error('Logout failed:', error)
  }
}

// Load data on mount
onMounted(() => {
  loadSites()
})
</script>
