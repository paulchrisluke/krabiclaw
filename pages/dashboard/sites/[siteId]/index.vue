<template>
  <div class="site-dashboard">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">{{ site?.name || 'Site Dashboard' }}</h1>
      <p class="text-gray-600 mt-2">Manage your restaurant website and settings</p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-center py-12">
      <p class="text-gray-600">Loading dashboard...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <!-- Dashboard content -->
    <div v-else-if="site" class="space-y-8">
      <!-- Quick Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">Status</p>
              <p class="text-lg font-semibold text-gray-900">{{ site.status }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">Locations</p>
              <p class="text-lg font-semibold text-gray-900">{{ locationsCount }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">Menu Items</p>
              <p class="text-lg font-semibold text-gray-900">{{ menuItemsCount }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">Reviews</p>
              <p class="text-lg font-semibold text-gray-900">{{ reviewCount }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Launch Readiness -->
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold text-gray-900">Launch Readiness</h2>
          <NuxtLink 
            :to="`/dashboard/sites/${siteId}/launch`"
            class="text-blue-600 hover:text-blue-800 font-medium"
          >
            View Details →
          </NuxtLink>
        </div>

        <div v-if="launchReadiness">
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700">Overall Status</span>
              <span 
                :class="[
                  'px-2 py-1 text-xs font-medium rounded',
                  launchReadiness.overall_ready 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                ]"
              >
                {{ launchReadiness.overall_ready ? 'Ready' : 'Not Ready' }}
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div 
                class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                :style="{ width: `${Math.max(0, 100 - (launchReadiness.missing_critical * 20))}%` }"
              ></div>
            </div>
          </div>

          <div v-if="launchReadiness.missing_critical > 0" class="mb-4">
            <p class="text-sm text-red-600 font-medium">
              {{ launchReadiness.missing_critical }} critical items need attention
            </p>
          </div>

          <div v-if="launchReadiness.action_items.length > 0" class="space-y-2">
            <div 
              v-for="item in launchReadiness.action_items.slice(0, 3)" 
              :key="item.section + item.item"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex-1">
                <p class="text-sm font-medium text-gray-900">{{ item.description }}</p>
                <p class="text-xs text-gray-500">{{ item.section }}</p>
              </div>
              <NuxtLink 
                v-if="item.action_url"
                :to="item.action_url"
                class="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Fix →
              </NuxtLink>
            </div>
          </div>

          <div v-else class="text-green-600 text-sm font-medium">
            🎉 Your site is ready to launch!
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <NuxtLink 
          :to="`/dashboard/sites/${siteId}/settings`"
          class="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow block"
        >
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <div class="ml-4">
              <h3 class="text-lg font-medium text-gray-900">Settings</h3>
              <p class="text-sm text-gray-600">Configure site details</p>
            </div>
          </div>
        </NuxtLink>

        <NuxtLink 
          :to="`/dashboard/sites/${siteId}/menu`"
          class="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow block"
        >
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
            <div class="ml-4">
              <h3 class="text-lg font-medium text-gray-900">Menu</h3>
              <p class="text-sm text-gray-600">Manage restaurant menu</p>
            </div>
          </div>
        </NuxtLink>

        <NuxtLink 
          :to="site.public_url"
          target="_blank"
          class="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow block"
        >
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </div>
            <div class="ml-4">
              <h3 class="text-lg font-medium text-gray-900">View Site</h3>
              <p class="text-sm text-gray-600">Preview your website</p>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})
import { ref, computed } from 'vue'

const route = useRoute()
const siteId = route.params.siteId

// State
const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<any>(null)
const launchReadiness = ref<any>(null)
const locationsCount = ref(0)
const menuItemsCount = ref(0)
const reviewCount = ref(0)

// Load site data
const loadSiteData = async () => {
  loading.value = true
  error.value = null

  try {
    // Get site settings
    const settingsResponse = await $fetch(`/api/sites/${siteId}/settings`)
    if (settingsResponse.success) {
      site.value = settingsResponse.settings
    } else {
      throw new Error('Failed to load site settings')
    }

    // Get launch readiness
    const launchResponse = await $fetch(`/api/sites/${siteId}/launch-readiness`)
    if (launchResponse.success) {
      launchReadiness.value = launchResponse.launch_readiness
    }

    // Get locations count
    const locationsResponse = await $fetch(`/api/public/sites/${siteId}/locations`)
    if (locationsResponse.success) {
      locationsCount.value = locationsResponse.locations.length
    }

    // Get menu items count
    const menuResponse = await $fetch(`/api/public/sites/${siteId}/menus`)
    if (menuResponse.success && menuResponse.menu) {
      menuItemsCount.value = menuResponse.menu.items.length
    }

    // Get review count
    const googleResponse = await $fetch(`/api/public/sites/${siteId}/google-business`)
    if (googleResponse.reviews) {
      reviewCount.value = googleResponse.reviews.length
    }

  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load dashboard data'
  } finally {
    loading.value = false
  }
}

// Load data on mount
onMounted(() => {
  loadSiteData()
})
</script>
