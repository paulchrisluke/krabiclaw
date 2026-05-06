<template>
  <div class="launch-readiness">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">Launch Readiness</h1>
      <p class="text-gray-600 mt-2">Check what's configured and what needs attention before launching</p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-center py-12">
      <p class="text-gray-600">Checking launch readiness...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <!-- Launch readiness content -->
    <div v-else-if="readiness" class="space-y-8">
      <!-- Overall Status -->
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold text-gray-900">Overall Status</h2>
          <span 
            :class="[
              'px-3 py-2 text-sm font-medium rounded-lg',
              readiness.overall_ready 
                ? 'bg-green-100 text-green-800' 
                : 'bg-yellow-100 text-yellow-800'
            ]"
          >
            {{ readiness.overall_ready ? '🎉 Ready to Launch!' : '⚠️ Not Ready Yet' }}
          </span>
        </div>

        <div class="mb-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-gray-700">Progress</span>
            <span class="text-sm text-gray-600">
              {{ Math.max(0, 100 - (readiness.missing_critical * 20)) }}% Complete
            </span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-3">
            <div 
              class="bg-blue-600 h-3 rounded-full transition-all duration-500"
              :style="{ width: `${Math.max(0, 100 - (readiness.missing_critical * 20))}%` }"
            ></div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-900">{{ readiness.missing_critical }}</div>
            <div class="text-sm text-gray-600">Critical Items</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-900">{{ readiness.missing_optional }}</div>
            <div class="text-sm text-gray-600">Optional Items</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">
              {{ 6 - readiness.missing_critical - readiness.missing_optional }}
            </div>
            <div class="text-sm text-gray-600">Completed</div>
          </div>
        </div>
      </div>

      <!-- Action Items -->
      <div v-if="readiness.action_items.length > 0" class="bg-white rounded-lg border border-gray-200 p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-6">Action Items</h2>
        
        <div class="space-y-4">
          <div 
            v-for="item in readiness.action_items" 
            :key="item.section + item.item"
            class="flex items-start justify-between p-4 border border-gray-200 rounded-lg"
            :class="{
              'border-red-200 bg-red-50': item.priority === 'critical',
              'border-yellow-200 bg-yellow-50': item.priority === 'optional'
            }"
          >
            <div class="flex-1">
              <div class="flex items-center mb-2">
                <span 
                  :class="[
                    'px-2 py-1 text-xs font-medium rounded mr-2',
                    item.priority === 'critical' 
                      ? 'bg-red-100 text-red-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  ]"
                >
                  {{ item.priority === 'critical' ? 'Critical' : 'Optional' }}
                </span>
                <span class="text-sm text-gray-500">{{ item.section }}</span>
              </div>
              <p class="text-gray-900 font-medium">{{ item.description }}</p>
            </div>
            
            <UButton 
              v-if="item.action_url"
              :to="item.action_url"
              color="info"
              size="sm"
              class="ml-4"
            >
              Fix →
            </UButton>
          </div>
        </div>
      </div>

      <!-- Detailed Status -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Site Identity -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Site Identity</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Site Name</span>
              <CheckIcon :checked="readiness.sections.site_identity.items.name" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Subdomain</span>
              <CheckIcon :checked="readiness.sections.site_identity.items.subdomain" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Theme</span>
              <CheckIcon :checked="readiness.sections.site_identity.items.theme" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Status Active</span>
              <CheckIcon :checked="readiness.sections.site_identity.items.status" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Primary Location</span>
              <CheckIcon :checked="readiness.sections.site_identity.items.primary_location" />
            </div>
          </div>
        </div>

        <!-- Brand Basics -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Brand Basics</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Brand Name</span>
              <CheckIcon :checked="readiness.sections.brand_basics.items.brand_name" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Description</span>
              <CheckIcon :checked="readiness.sections.brand_basics.items.description" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Contact Email</span>
              <CheckIcon :checked="readiness.sections.brand_basics.items.contact_email" />
            </div>
          </div>
        </div>

        <!-- Publishing Status -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Publishing Status</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Site Active</span>
              <CheckIcon :checked="readiness.sections.publishing_status.items.site_active" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Public URL</span>
              <CheckIcon :checked="readiness.sections.publishing_status.items.public_url" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Last Published</span>
              <CheckIcon :checked="readiness.sections.publishing_status.items.last_published" />
            </div>
          </div>
        </div>

        <!-- Domain Status -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Domain Status</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Subdomain</span>
              <CheckIcon :checked="readiness.sections.domain_status.items.subdomain" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Custom Domain</span>
              <CheckIcon :checked="readiness.sections.domain_status.items.custom_domain" />
            </div>
          </div>
        </div>

        <!-- Integrations -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Integrations</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Google Business Connected</span>
              <CheckIcon :checked="readiness.sections.integrations.items.google_business_connected" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Locations Imported</span>
              <CheckIcon :checked="readiness.sections.integrations.items.locations_imported" />
            </div>
          </div>
        </div>

        <!-- Content Readiness -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Content Readiness</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Homepage Hero</span>
              <CheckIcon :checked="readiness.sections.content_readiness.items.homepage_hero" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Menu Exists</span>
              <CheckIcon :checked="readiness.sections.content_readiness.items.menu_exists" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Menu Items</span>
              <CheckIcon :checked="readiness.sections.content_readiness.items.menu_items_exist" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Contact Details</span>
              <CheckIcon :checked="readiness.sections.content_readiness.items.contact_details" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Locations Exist</span>
              <CheckIcon :checked="readiness.sections.content_readiness.items.locations_exist" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700">SEO Metadata</span>
              <CheckIcon :checked="readiness.sections.content_readiness.items.seo_metadata" />
            </div>
          </div>
        </div>
      </div>

      <!-- Success State -->
      <div v-if="readiness.overall_ready" class="bg-green-50 border border-green-200 rounded-lg p-6">
        <div class="text-center">
          <div class="text-4xl mb-4">🎉</div>
          <h3 class="text-xl font-semibold text-green-900 mb-2">Ready to Launch!</h3>
          <p class="text-green-800 mb-6">
            Your site is fully configured and ready to go live. All critical items have been completed.
          </p>
          <div class="flex space-x-4 justify-center">
            <UButton 
              :to="`/dashboard/sites/${siteId}`"
              color="success"
            >
              Back to Dashboard
            </UButton>
            <UButton 
              :href="siteUrl"
              target="_blank"
              variant="outline"
              color="success"
            >
              Preview Site →
            </UButton>
          </div>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="flex items-center justify-between">
        <NuxtLink 
          :to="`/dashboard/sites/${siteId}`"
          class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
        >
          ← Back to Dashboard
        </NuxtLink>
        
        <div class="space-x-4">
          <NuxtLink 
            :to="`/dashboard/sites/${siteId}/settings`"
            class="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Settings
          </NuxtLink>
        </div>
      </div>
    </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})
import { ref, onMounted } from 'vue'

// Check icon component
const CheckIcon = ({ checked }) => {
  return h('div', {
    class: [
      'w-5 h-5 rounded-full flex items-center justify-center',
      checked ? 'bg-green-100' : 'bg-gray-100'
    ]
  }, [
    h('svg', {
      class: 'w-3 h-3',
      fill: 'none',
      stroke: checked ? '#10b981' : '#9ca3af',
      viewBox: '0 0 24 24'
    }, [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-width': '2',
        d: checked ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'
      })
    ])
  ])
}

const route = useRoute()
const siteId = route.params.siteId

// State
const loading = ref(true)
const error = ref(null)
const readiness = ref(null)
const siteUrl = ref('')

// Load launch readiness
const loadReadiness = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch(`/api/sites/${siteId}/launch-readiness`)
    if (response.success) {
      readiness.value = response.launch_readiness
      
      // Get site URL for preview
      const settingsResponse = await $fetch(`/api/sites/${siteId}/settings`)
      if (settingsResponse.success) {
        siteUrl.value = settingsResponse.settings.public_url
      }
    } else {
      throw new Error('Failed to load launch readiness')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load launch readiness'
  } finally {
    loading.value = false
  }
}

// Load data on mount
onMounted(() => {
  loadReadiness()
})
</script>
