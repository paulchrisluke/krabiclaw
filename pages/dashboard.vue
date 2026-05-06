<template>
  <!-- Loading State -->
  <div v-if="loading" class="text-center py-12">
    <USkeleton class="h-8 w-8 rounded-full mx-auto mb-2" />
    <p class="mt-2 text-stone-600">Loading dashboard...</p>
  </div>

  <!-- Dashboard Content -->
  <div v-else class="space-y-8">
    <!-- Welcome Section -->
    <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
      <h2 class="text-lg font-semibold text-stone-900 mb-2">Welcome back, {{ user?.name || user?.email }}</h2>
      <p class="text-stone-600">
        Manage your restaurant websites, domains, and integrations from this dashboard.
      </p>
    </div>

    <!-- Sites Overview -->
    <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold text-stone-900">Your Sites</h3>
        <UButton
          to="/dashboard/onboarding"
          color="stone"
          variant="soft"
          size="sm"
        >
          <Icon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
          Create New Site
        </UButton>
      </div>
      
      <div v-if="sites.length === 0" class="text-center py-8">
        <Icon name="i-heroicons-globe-alt" class="w-12 h-12 text-stone-400 mx-auto" />
        <h3 class="mt-2 text-lg font-medium text-stone-900">No sites yet</h3>
        <p class="mt-1 text-stone-500">Get started by creating your first restaurant website.</p>
        <div class="mt-6">
          <UButton
            to="/dashboard/onboarding"
            color="black"
            size="lg"
          >
            Create Your First Site
          </UButton>
        </div>
      </div>
      
      <div v-else class="space-y-4">
        <div
          v-for="site in sites"
          :key="site.id"
          class="flex items-center justify-between p-4 border border-stone-200 rounded-lg hover:bg-stone-50"
        >
          <div class="flex-1">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center">
                <Icon name="i-heroicons-globe-alt" class="w-5 h-5 text-stone-600" />
              </div>
              <div>
                <h4 class="font-medium text-stone-900">{{ site.name }}</h4>
                <p class="text-sm text-stone-600">
                  {{ site.subdomain }}.krabiclaw.com
                </p>
                <div class="flex items-center space-x-2 mt-1">
                  <UBadge
                    :color="site.status === 'active' ? 'green' : 'yellow'"
                    variant="soft"
                    size="xs"
                  >
                    {{ site.status === 'active' ? 'Active' : 'Pending' }}
                  </UBadge>
                  <UBadge
                    v-if="site.onboarding_status === 'active'"
                    color="blue"
                    variant="soft"
                    size="xs"
                  >
                    Ready to launch
                  </UBadge>
                </div>
              </div>
            </div>
          </div>
          
          <div class="flex items-center space-x-2">
            <UButton
              :to="`/dashboard/sites/${site.id}`"
              variant="ghost"
              color="blue"
              size="sm"
            >
              Manage
            </UButton>
            <UButton
              :href="`https://${site.subdomain}.krabiclaw.com`"
              target="_blank"
              rel="noopener noreferrer"
              variant="ghost"
              color="gray"
              size="sm"
            >
              <Icon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
              View Live
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
      <h3 class="text-lg font-semibold text-stone-900 mb-4">Quick Actions</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <UButton
          to="/dashboard/onboarding"
          color="stone"
          variant="outline"
          class="h-auto p-4"
        >
          <div class="text-left">
            <Icon name="i-heroicons-plus" class="w-6 h-6 text-stone-600 mb-2" />
            <p class="font-medium text-stone-900">Create Site</p>
            <p class="text-sm text-stone-600">Add new restaurant</p>
          </div>
        </UButton>
        
        <UButton
          to="/dashboard/billing"
          color="stone"
          variant="outline"
          class="h-auto p-4"
        >
          <div class="text-left">
            <Icon name="i-heroicons-credit-card" class="w-6 h-6 text-stone-600 mb-2" />
            <p class="font-medium text-stone-900">Billing</p>
            <p class="text-sm text-stone-600">Manage subscription</p>
          </div>
        </UButton>
        
        <UButton
          to="/dashboard/integrations"
          color="stone"
          variant="outline"
          class="h-auto p-4"
        >
          <div class="text-left">
            <Icon name="i-heroicons-link" class="w-6 h-6 text-stone-600 mb-2" />
            <p class="font-medium text-stone-900">Integrations</p>
            <p class="text-sm text-stone-600">Connect services</p>
          </div>
        </UButton>
        
        <UButton
          to="/dashboard/help"
          color="stone"
          variant="outline"
          class="h-auto p-4"
        >
          <div class="text-left">
            <Icon name="i-heroicons-question-mark-circle" class="w-6 h-6 text-stone-600 mb-2" />
            <p class="font-medium text-stone-900">Help</p>
            <p class="text-sm text-stone-600">Get support</p>
          </div>
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { authClient } from '~/utils/auth-client'

definePageMeta({
  layout: 'dashboard'
})

const sites = ref([])
const loading = ref(true)
const user = ref(null)

onMounted(async () => {
  try {
    // Check onboarding status first
    const status = await $fetch('/api/onboarding/status')
    user.value = status.user
    
    if (status.needsOnboarding) {
      // User has no sites, redirect to onboarding
      await navigateTo('/dashboard/onboarding')
      return
    }
    
    // User has sites, load them
    sites.value = status.sites || []
  } catch (error) {
    console.error('Failed to load dashboard:', error)
  } finally {
    loading.value = false
  }
})

// Handle logout
async function handleLogout() {
  try {
    await authClient.signOut()
    await navigateTo('/login')
  } catch (error) {
    console.error('Logout failed:', error)
  }
}
</script>
