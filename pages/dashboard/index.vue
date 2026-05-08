<template>
  <div>
    <!-- Main Content -->
    <UContainer class="py-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <USkeleton class="h-8 w-8 mx-auto mb-4" />
        <p class="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>

      <!-- Onboarding State -->
      <UCard v-else-if="!hasOrganization" class="max-w-md mx-auto">
        <div class="text-center py-12">
          <Icon name="i-heroicons-building-storefront" class="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Create Your Restaurant Website
          </h2>
          <p class="text-gray-600 dark:text-gray-400 mb-8">
            Let's get your restaurant online with a beautiful website.
          </p>
          <UButton
            to="/dashboard/onboarding"
            color="neutral"
            size="xl"
            block
          >
            Get Started
          </UButton>
        </div>
      </UCard>

      <!-- Sites State -->
      <div v-else>
        <!-- Admin Stats Section -->
        <div class="mb-8">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Business Overview
          </h2>
          
          <!-- Stats Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <UCard>
              <div class="text-center">
                <UBadge variant="subtle" class="mb-2">Reviews</UBadge>
                <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ publicData?.reviews?.length ?? '—' }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <UBadge variant="subtle" class="mb-2">Media</UBadge>
                <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ publicData?.media?.length ?? '—' }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <UBadge variant="subtle" class="mb-2">Posts</UBadge>
                <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ publicData?.posts?.length ?? '—' }}</p>
              </div>
            </UCard>
          </div>

          <!-- Google Business Data -->
          <UCard>
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 class="text-lg font-bold text-gray-900 dark:text-white">Google Business Data</h2>
                <p class="text-sm text-gray-500 mt-1">
                  {{ publicData?.syncedAt ? `Last synced ${formatDate(publicData.syncedAt)}` : 'Never synced' }}
                </p>
                <p v-if="syncErrors.length" class="text-sm text-red-500 mt-1">
                  {{ syncErrors.length }} sync error{{ syncErrors.length > 1 ? 's' : '' }} — check Connection tab
                </p>
              </div>
              <UButton
                to="/dashboard/connection"
                variant="outline"
                size="sm"
              >
                Manage Connection →
              </UButton>
            </div>
          </UCard>
        </div>

        <div class="mb-8">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Your Restaurant Websites
          </h2>
          <p class="text-gray-600 dark:text-gray-400">
            Manage your restaurant websites and content
          </p>
        </div>

        <!-- Sites Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Site Cards -->
          <UCard
            v-for="site in sites"
            :key="site.id"
            class="hover:shadow-md transition-shadow"
          >
            <div class="flex justify-between items-start mb-4">
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ site.name }}
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ site.subdomain }}{{ platformHostname ? `.${platformHostname}` : '' }}
                </p>
              </div>
              <UBadge :color="site.status === 'active' ? 'success' : 'warning'" variant="soft" size="xs">
                {{ site.status }}
              </UBadge>
            </div>
            <div class="space-y-2">
              <UButton
                :to="`/dashboard/sites/${site.id}`"
                variant="outline"
                size="sm"
                block
              >
                Manage Site
              </UButton>
              <UButton
                :href="platformHostname ? `https://${site.subdomain}.${platformHostname}` : undefined"
                target="_blank"
                variant="ghost"
                size="sm"
                block
                :disabled="!platformHostname"
              >
                View Live Site
              </UButton>
            </div>
          </UCard>

          <!-- Add Site Card -->
          <UCard class="hover:shadow-md transition-shadow">
            <div class="text-center">
              <Icon name="i-heroicons-plus" class="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Add Another Site
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Create another restaurant website
              </p>
              <UButton
                to="/dashboard/onboarding"
                variant="outline"
                block
              >
                Create Site
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup>
import { authClient } from '~/lib/auth-client'

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
})

const config = useRuntimeConfig()

// Extract hostname from config for URLs
const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  if (!domain) return ''
  try {
    // URL API is the most robust way to parse hostnames
    const urlStr = domain.startsWith('http') ? domain : `https://${domain}`
    return new URL(urlStr).hostname
  } catch (e) {
    // Fallback to simple replace if URL parsing fails
    return domain.replace(/^https?:\/\//, '').split('/')[0].replace(/\.+$/, '')
  }
})

const organizationsState = authClient.useListOrganizations()
const organizations = computed(() => unref(organizationsState)?.data ?? [])
const sites = ref([])
const sitesLoading = ref(false)

// Admin stats data
const publicData = ref(null)
const syncErrors = computed(() => publicData.value?.errors?.filter(e => e.source !== 'db') ?? [])

const averageRating = computed(() => {
  const reviews = publicData.value?.reviews ?? []
  if (!reviews.length) return null
  const map = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
  const ratings = reviews.map(r => r.rating ?? map[r.starRating] ?? 0).filter(Boolean)
  if (!ratings.length) return null
  return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
})

const formatDate = (iso) => new Date(iso).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
})

// Computed
const hasOrganization = computed(() => organizations.value.length > 0)
const loading = computed(() => Boolean(unref(organizationsState)?.isPending) || sitesLoading.value)


// Load sites when organizations are ready
watch(organizations, async (newOrgs) => {
  if (newOrgs.length > 0) {
    sitesLoading.value = true
    try {
      const userSites = await $fetch('/api/sites')
      sites.value = userSites.sites
      // Fetch Google Business data for the first site
      if (sites.value?.[0]?.id) {
        publicData.value = await $fetch(`/api/public/sites/${sites.value[0].id}/google-business`)
      }
    } catch (error) {
      console.error('Failed to load sites:', error)
    } finally {
      sitesLoading.value = false
    }
  }
}, { immediate: true })

// Sign out handler
async function handleSignOut() {
  try {
    await authClient.signOut()
    await navigateTo('/login')
  } catch (error) {
    console.error('Sign out failed:', error)
  }
}
</script>
