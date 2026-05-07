<template>
  <div class="site-settings">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">Site Settings</h1>
      <p class="text-gray-600 mt-2">Configure your restaurant website details and preferences</p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-center py-12">
      <p class="text-gray-600">Loading settings...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <!-- Settings form -->
    <div v-else-if="settings" class="space-y-8">
      <!-- Site Identity -->
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-6">Site Identity</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Site Name</label>
            <input 
              v-model="form.name"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your restaurant name"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Subdomain</label>
            <input 
              :value="settings.subdomain"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
              readonly
              placeholder="your-restaurant"
            />
            <p class="text-xs text-gray-500 mt-1">Subdomain cannot be changed after creation</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Theme</label>
            <input 
              :value="settings.theme"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
              readonly
            />
            <p class="text-xs text-gray-500 mt-1">Saya theme is currently the only option</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div class="flex items-center">
              <span 
                :class="[
                  'px-2 py-1 text-xs font-medium rounded',
                  settings.status === 'active' 
                    ? 'bg-green-100 text-green-800' 
                    : settings.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                ]"
              >
                {{ settings.status }}
              </span>
            </div>
          </div>
        </div>

        <div class="mt-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">Public URL</label>
          <div class="flex items-center space-x-2">
            <input 
              :value="settings.public_url"
              type="text"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
              readonly
            />
            <UButton
              @click="copyToClipboard(settings.public_url)"
              variant="outline"
              color="neutral"
              size="sm"
            >
              Copy
            </UButton>
          </div>
        </div>
      </div>

      <!-- Brand Basics -->
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-6">Brand Basics</h2>
        
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Restaurant/Brand Name</label>
            <input 
              v-model="form.brand_name"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your Restaurant Name"
            />
            <p class="text-xs text-gray-500 mt-1">This is displayed prominently on your website</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Short Description</label>
            <textarea 
              v-model="form.brand_description"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Authentic dining experience in your city"
            ></textarea>
            <p class="text-xs text-gray-500 mt-1">Brief description of your restaurant (used for SEO and homepage)</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Logo URL (optional)</label>
            <input 
              v-model="form.logo_url"
              type="url"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com/logo.png"
            />
            <p class="text-xs text-gray-500 mt-1">URL to your restaurant logo image</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Contact Email (optional)</label>
            <input 
              v-model="form.contact_email"
              type="email"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="contact@yourrestaurant.com"
            />
            <p class="text-xs text-gray-500 mt-1">Public contact email for customers</p>
          </div>
        </div>
      </div>

      <!-- Publishing Status -->
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-6">Publishing Status</h2>
        
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">Site Status</span>
            <span 
              :class="[
                'px-2 py-1 text-xs font-medium rounded',
                settings.status === 'active' 
                  ? 'bg-green-100 text-green-800' 
                  : settings.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              ]"
            >
              {{ settings.status }}
            </span>
          </div>
          
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">Last Published</span>
            <span class="text-sm text-gray-600">
              {{ settings.last_published_at ? new Date(settings.last_published_at).toLocaleDateString() : 'Never' }}
            </span>
          </div>
          
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">Public Preview</span>
            <a 
              :href="settings.public_url"
              target="_blank"
              class="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Open in new tab →
            </a>
          </div>
        </div>
      </div>

      <!-- Domain Status -->
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-6">Domain Status</h2>
        
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">Free Subdomain</span>
            <div class="flex items-center space-x-2">
              <span class="text-sm text-gray-600">{{ settings.subdomain }}.{{ freeDomain }}</span>
              <UBadge color="success" variant="soft" size="sm">Active</UBadge>
            </div>
          </div>
          
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">Custom Domain</span>
            <div class="flex items-center space-x-2">
              <span class="text-sm text-gray-600">Not configured</span>
              <UBadge color="neutral" variant="soft" size="sm">Optional</UBadge>
            </div>
          </div>
          
          <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 class="text-sm font-medium text-blue-900 mb-2">Custom Domain Setup</h3>
            <p class="text-sm text-blue-800 mb-3">
              Want to use your own domain? Contact us to set up custom domain configuration.
            </p>
            <div class="text-xs text-blue-700">
              <p class="font-medium mb-1">Manual setup requirements:</p>
              <ul class="list-disc list-inside space-y-1">
                <li>DNS A record pointing to our server IP</li>
                <li>SSL certificate configuration</li>
                <li>Domain verification</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center justify-between">
        <NuxtLink 
          :to="`/dashboard/sites/${siteId}`"
          class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
        >
          ← Back to Dashboard
        </NuxtLink>
        
        <div class="flex space-x-4">
          <UButton
            @click="resetForm"
            variant="outline"
            color="neutral"
          >
            Reset
          </UButton>
          
          <UButton
            @click="saveSettings"
            :disabled="saving"
            :loading="saving"
            color="info"
          >
            {{ saving ? 'Saving...' : 'Save Settings' }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})
import { ref, reactive, onMounted } from 'vue'

const route = useRoute()
const siteId = route.params.siteId

// State
const loading = ref(true)
const error = ref<string | null>(null)
const saving = ref(false)
const settings = ref<any>(null)

// Form data
const form = reactive({
  name: '',
  brand_name: '',
  brand_description: '',
  logo_url: '',
  contact_email: '',
  primary_location_id: null
})

// Load settings
const loadSettings = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch(`/api/sites/${siteId}/settings`)
    if (response.success) {
      settings.value = response.settings
      
      // Populate form
      form.name = settings.value.name || ''
      form.brand_name = settings.value.brand_name || ''
      form.brand_description = settings.value.brand_description || ''
      form.logo_url = settings.value.logo_url || ''
      form.contact_email = settings.value.contact_email || ''
      form.primary_location_id = settings.value.primary_location_id || null
    } else {
      throw new Error('Failed to load settings')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
}

// Save settings
const saveSettings = async () => {
  saving.value = true

  try {
    const response = await $fetch(`/api/sites/${siteId}/settings`, {
      method: 'PATCH',
      body: {
        name: form.name,
        brand_name: form.brand_name,
        brand_description: form.brand_description,
        logo_url: form.logo_url,
        contact_email: form.contact_email,
        primary_location_id: form.primary_location_id
      }
    })

    if (response.success) {
      settings.value = response.settings
      // Show success message (you could add a toast notification here)
      alert('Settings saved successfully!')
    } else {
      throw new Error('Failed to save settings')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

// Reset form
const resetForm = () => {
  if (settings.value) {
    form.name = settings.value.name || ''
    form.brand_name = settings.value.brand_name || ''
    form.brand_description = settings.value.brand_description || ''
    form.logo_url = settings.value.logo_url || ''
    form.contact_email = settings.value.contact_email || ''
    form.primary_location_id = settings.value.primary_location_id || null
  }
}

// Copy to clipboard
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    // You could show a toast notification here
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  }
}

// Get free domain from environment
const freeDomain = computed(() => {
  const config = useRuntimeConfig()
  const domain = config.public.freeSiteDomain
  // Remove protocol if present to get just the hostname
  return domain.replace(/^https?:\/\//, '')
})

// Load settings on mount
onMounted(() => {
  loadSettings()
})
</script>
