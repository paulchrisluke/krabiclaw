<template>
  <div class="min-h-screen bg-stone-50">
    <div class="max-w-2xl mx-auto pt-16 pb-12 px-4">
      <!-- KrabiClaw Branding -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-stone-900 mb-2">
          Welcome to KrabiClaw
        </h1>
        <p class="text-stone-600">
          Let's set up your restaurant website
        </p>
      </div>

      <!-- Onboarding Form -->
      <div class="bg-white rounded-xl shadow-sm border border-stone-200 p-8">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- Restaurant Name -->
          <div>
            <label for="restaurantName" class="block text-sm font-medium text-stone-700 mb-2">
              Restaurant Name
            </label>
            <input
              id="restaurantName"
              v-model="form.restaurantName"
              type="text"
              required
              :disabled="loading"
              class="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent disabled:opacity-50"
              placeholder="Your Restaurant Name"
            />
            <p class="mt-1 text-sm text-stone-500">
              This will be your brand name across your website
            </p>
          </div>

          <!-- Subdomain -->
          <div>
            <label for="subdomain" class="block text-sm font-medium text-stone-700 mb-2">
              Website Address
            </label>
            <div class="flex">
              <input
                id="subdomain"
                v-model="form.subdomain"
                type="text"
                required
                :disabled="loading"
                @input="validateSubdomain"
                class="flex-1 px-4 py-3 border border-stone-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent disabled:opacity-50"
                placeholder="your-restaurant"
              />
              <div class="px-4 py-3 bg-stone-100 border border-l-0 border-stone-300 rounded-r-lg text-stone-600">
                .krabiclaw.com
              </div>
            </div>
            
            <!-- Subdomain Validation Messages -->
            <div class="mt-2 space-y-1">
              <p v-if="subdomainStatus.available === false" class="text-sm text-red-600">
                {{ subdomainStatus.message }}
              </p>
              <p v-else-if="subdomainStatus.available === true" class="text-sm text-green-600">
                {{ subdomainStatus.message }}
              </p>
              <p v-else class="text-sm text-stone-500">
                {{ subdomainStatus.message }}
              </p>
            </div>
            
            <div class="mt-2 text-xs text-stone-500">
              Use 3-63 characters: lowercase letters, numbers, and hyphens
            </div>
          </div>

          <!-- Submit Button -->
          <div class="pt-4">
            <UButton
              type="submit"
              :disabled="loading || !isFormValid"
              :loading="loading"
              color="neutral"
              size="lg"
              block
            >
              <template v-if="loading">
                Creating your website...
              </template>
              <template v-else>
                Create Your Website
              </template>
            </UButton>
          </div>
        </form>

        <!-- Features -->
        <div class="mt-8 pt-8 border-t border-stone-200">
          <h3 class="text-sm font-medium text-stone-900 mb-4">What you'll get:</h3>
          <div class="space-y-3">
            <div class="flex items-center text-sm text-stone-600">
              <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
              </svg>
              Beautiful restaurant website
            </div>
            <div class="flex items-center text-sm text-stone-600">
              <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
              </svg>
              Free subdomain ({{ form.subdomain || 'your-restaurant' }}.krabiclaw.com)
            </div>
            <div class="flex items-center text-sm text-stone-600">
              <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
              </svg>
              Easy content editing
            </div>
            <div class="flex items-center text-sm text-stone-600">
              <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
              </svg>
              Mobile-friendly design
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

definePageMeta({
  layout: 'dashboard',
  ssr: false
})

const router = useRouter()

// Form state
const form = ref({
  restaurantName: '',
  subdomain: ''
})

// Loading state
const loading = ref(false)

// Subdomain validation state
const subdomainStatus = ref({
  available: null,
  message: 'Enter your desired subdomain'
})

// Reserved subdomains
const reservedSubdomains = [
  'www', 'app', 'api', 'admin', 'dashboard', 'login', 'signup', 
  'pricing', 'billing', 'support', 'help', 'docs', 'blog', 'posts', 
  'qa', 'legal', 'terms', 'privacy', 'static', 'assets', 'cdn', 
  'mail', 'status'
]

// Validate subdomain format
function validateSubdomainFormat(subdomain) {
  if (!subdomain) return false
  if (subdomain.length < 3 || subdomain.length > 63) return false
  if (reservedSubdomains.includes(subdomain.toLowerCase())) return false
  if (!/^[a-z0-9-]+$/.test(subdomain.toLowerCase())) return false
  if (subdomain.startsWith('-') || subdomain.endsWith('-')) return false
  
  return true
}

// Check subdomain availability
async function checkSubdomainAvailability(subdomain) {
  if (!validateSubdomainFormat(subdomain)) {
    subdomainStatus.value = {
      available: false,
      message: 'Invalid subdomain format'
    }
    return
  }

  try {
    const response = await $fetch('/api/onboarding/validate-subdomain', {
      method: 'POST',
      body: { subdomain: subdomain.toLowerCase() }
    })

    subdomainStatus.value = {
      available: response.available,
      message: response.available 
        ? 'Available!' 
        : 'This subdomain is already taken'
    }
  } catch (error) {
    subdomainStatus.value = {
      available: false,
      message: 'Error checking availability'
    }
  }
}

// Debounced subdomain validation
let validationTimeout
function validateSubdomain() {
  const subdomain = form.value.subdomain.toLowerCase()
  
  clearTimeout(validationTimeout)
  
  if (!subdomain) {
    subdomainStatus.value = {
      available: null,
      message: 'Enter your desired subdomain'
    }
    return
  }

  if (!validateSubdomainFormat(subdomain)) {
    subdomainStatus.value = {
      available: false,
      message: 'Invalid subdomain format'
    }
    return
  }

  validationTimeout = setTimeout(() => {
    checkSubdomainAvailability(subdomain)
  }, 500)
}

// Form validation
const isFormValid = computed(() => {
  return form.value.restaurantName.trim() && 
         form.value.subdomain.trim() && 
         subdomainStatus.value.available === true
})

// Handle form submission
async function handleSubmit() {
  if (!isFormValid.value || loading.value) return

  loading.value = true

  try {
    const response = await $fetch('/api/onboarding/create-site', {
      method: 'POST',
      body: {
        restaurantName: form.value.restaurantName.trim(),
        subdomain: form.value.subdomain.toLowerCase().trim()
      }
    })

    // Redirect to dashboard or site editor
    await router.push(`/dashboard/sites/${response.siteId}`)
  } catch (error) {
    console.error('Onboarding failed:', error)
    // Show error message to user
    alert('Failed to create your website. Please try again.')
  } finally {
    loading.value = false
  }
}

// Check if user already has organization/site and redirect
onMounted(async () => {
  try {
    // Check onboarding status
    const status = await $fetch('/api/onboarding/status')
    // Only redirect if user has no organization at all (first-time setup)
    // Allow users with existing organizations to create additional sites
    if (!status.organization) {
      await navigateTo('/dashboard')
    }
  } catch (error) {
    console.error('Error checking onboarding status:', error)
    // Stay on onboarding page if status check fails
  }
})
</script>
