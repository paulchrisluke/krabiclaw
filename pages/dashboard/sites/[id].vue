<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="site?.name || 'Site Details'" icon="i-heroicons-globe-alt">
        <template #right>
          <div class="flex items-center gap-2">
            <UBadge 
              :color="site?.onboarding_status === 'active' ? 'green' : 'amber'" 
              variant="subtle"
              size="sm"
            >
              {{ site?.onboarding_status }}
            </UBadge>
            <UButton
              v-if="site"
              :to="`https://${site.subdomain}.${platformHostname}`"
              target="_blank"
              variant="outline"
              color="primary"
              icon="i-heroicons-arrow-top-right-on-square"
              size="sm"
            >
              View Live Site
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center h-64">
        <div class="text-center">
          <USkeleton class="h-8 w-8 mx-auto mb-4" />
          <p class="text-muted-foreground">Loading site...</p>
        </div>
      </div>

      <!-- Site Content -->
      <div v-else-if="site" class="space-y-6">
        <!-- Site Info Card -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Site Information</h3>
          </template>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1">
              <p class="text-sm font-medium text-muted-foreground">Restaurant Name</p>
              <p class="font-semibold">{{ site.name }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-sm font-medium text-muted-foreground">Website Address</p>
              <p class="font-semibold">{{ site.subdomain }}.{{ platformHostname }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-sm font-medium text-muted-foreground">Theme</p>
              <p class="font-semibold">Saya</p>
            </div>
            <div class="space-y-1">
              <p class="text-sm font-medium text-muted-foreground">Plan</p>
              <div class="flex items-center gap-2">
                <p class="font-semibold">{{ site.plan === 'free' ? 'Free' : 'Premium' }}</p>
                <UBadge 
                  :color="site.plan === 'free' ? 'gray' : 'primary'" 
                  variant="soft"
                  size="xs"
                >
                  {{ site.plan === 'free' ? 'Limited' : 'Full Access' }}
                </UBadge>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Quick Actions Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <UCard class="hover:shadow-md transition-shadow cursor-pointer" @click="editContent">
            <div class="flex flex-col items-center text-center p-4">
              <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                <UIcon name="i-heroicons-pencil-square" class="w-6 h-6 text-primary" />
              </div>
              <h4 class="font-semibold mb-1">Edit Content</h4>
              <p class="text-sm text-muted-foreground">Update restaurant info</p>
            </div>
          </UCard>

          <UCard class="hover:shadow-md transition-shadow cursor-pointer" @click="manageMenu">
            <div class="flex flex-col items-center text-center p-4">
              <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                <UIcon name="i-heroicons-clipboard-document-list" class="w-6 h-6 text-primary" />
              </div>
              <h4 class="font-semibold mb-1">Manage Menu</h4>
              <p class="text-sm text-muted-foreground">Edit menu items</p>
            </div>
          </UCard>

          <UCard class="hover:shadow-md transition-shadow cursor-pointer" @click="$router.push('/dashboard/sites/' + site.id + '/analytics')">
            <div class="flex flex-col items-center text-center p-4">
              <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                <UIcon name="i-heroicons-chart-bar" class="w-6 h-6 text-primary" />
              </div>
              <h4 class="font-semibold mb-1">Analytics</h4>
              <p class="text-sm text-muted-foreground">View site stats</p>
            </div>
          </UCard>

          <UCard class="hover:shadow-md transition-shadow cursor-pointer" @click="$router.push('/dashboard/sites/' + site.id + '/settings')">
            <div class="flex flex-col items-center text-center p-4">
              <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                <UIcon name="i-heroicons-cog-6-tooth" class="w-6 h-6 text-primary" />
              </div>
              <h4 class="font-semibold mb-1">Settings</h4>
              <p class="text-sm text-muted-foreground">Site configuration</p>
            </div>
          </UCard>
        </div>

        <!-- Status & Actions -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Site Status -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Site Status</h3>
            </template>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Status</span>
                <UBadge 
                  :color="site.onboarding_status === 'active' ? 'green' : 'amber'" 
                  variant="subtle"
                >
                  {{ site.onboarding_status }}
                </UBadge>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Last Updated</span>
                <span class="text-sm text-muted-foreground">{{ new Date(site.updated_at).toLocaleDateString() }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Created</span>
                <span class="text-sm text-muted-foreground">{{ new Date(site.created_at).toLocaleDateString() }}</span>
              </div>
            </div>
          </UCard>

          <!-- Quick Actions -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Quick Actions</h3>
            </template>
            <div class="space-y-3">
              <UButton 
                :to="`https://${site.subdomain}.${platformHostname}`"
                target="_blank"
                variant="outline"
                color="primary"
                icon="i-heroicons-arrow-top-right-on-square"
                block
              >
                View Live Site
              </UButton>
              <UButton 
                to="/billing"
                variant="outline"
                icon="i-heroicons-credit-card"
                block
              >
                Manage Billing
              </UButton>
            </div>
          </UCard>
        </div>

        <!-- Onboarding Status Alert -->
        <UAlert
          v-if="site.onboarding_status === 'pending' || site.onboarding_status === 'failed'"
          :title="site.onboarding_status === 'failed' ? 'Site Setup Failed' : 'Site Setup In Progress'"
          :description="site.onboarding_status === 'failed' ? 'Your site setup encountered an error. You can retry the setup process.' : 'Your site is being set up. This usually takes a few seconds.'"
          color="amber"
          variant="subtle"
        >
          <template #actions>
            <UButton
              @click="retryOnboarding"
              :disabled="retrying"
              :loading="retrying"
              color="amber"
              variant="solid"
              size="sm"
            >
              {{ retrying ? 'Retrying...' : 'Retry Setup' }}
            </UButton>
          </template>
        </UAlert>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'dashboard'
})

const router = useRouter()
const route = useRoute()
const config = useRuntimeConfig()

// Extract hostname from config for URLs
const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  // Remove protocol if present to get just the hostname
  return domain.replace(/^https?:\/\//, '')
})

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

    // Get site details (API handles authorization)
    const siteData = await $fetch(`/api/sites/${siteId}`)
    site.value = siteData
  } catch (error) {
    console.error('Failed to load site:', error)
    // Don't redirect automatically - let the user see the error
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
