<template>
  <div class="max-w-2xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-stone-900 mb-2">
        Create your restaurant website
      </h1>
      <p class="text-stone-600">
        Set up your professional restaurant presence in minutes
      </p>
    </div>

    <!-- Progress Steps -->
    <div class="mb-8">
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <div 
            :class="[
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
              currentStep >= 1 ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-600'
            ]"
          >
            1
          </div>
          <span class="ml-2 text-sm font-medium text-stone-900">Restaurant Name</span>
        </div>
        <div class="flex-1 h-0.5 bg-stone-200 mx-4"></div>
        <div class="flex items-center">
          <div 
            :class="[
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
              currentStep >= 2 ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-600'
            ]"
          >
            2
          </div>
          <span class="ml-2 text-sm font-medium text-stone-900">Website Address</span>
        </div>
        <div class="flex-1 h-0.5 bg-stone-200 mx-4"></div>
        <div class="flex items-center">
          <div 
            :class="[
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
              currentStep >= 3 ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-600'
            ]"
          >
            3
          </div>
          <span class="ml-2 text-sm font-medium text-stone-900">Confirm</span>
        </div>
      </div>
    </div>

    <!-- Onboarding Form -->
    <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- Step 1: Restaurant Name -->
        <div v-if="currentStep === 1">
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-stone-900 mb-2">What's your restaurant name?</h3>
            <p class="text-stone-600">This will be displayed as your brand name across the website.</p>
          </div>
          
          <div>
            <UFormGroup label="Restaurant Name" required>
              <UInput
                v-model="form.restaurantName"
                size="lg"
                placeholder="Your Restaurant Name"
                :disabled="loading"
                autofocus
              />
            </UFormGroup>
          </div>

          <div class="mt-8 flex justify-end">
            <UButton
              @click="nextStep"
              :disabled="!form.restaurantName.trim()"
              color="black"
              size="lg"
            >
              Next
              <Icon name="i-heroicons-arrow-right" class="w-4 h-4 ml-1" />
            </UButton>
          </div>
        </div>

        <!-- Step 2: Subdomain -->
        <div v-if="currentStep === 2">
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-stone-900 mb-2">Choose your website address</h3>
            <p class="text-stone-600">This will be your unique URL for the restaurant website.</p>
          </div>
          
          <div>
            <UFormGroup label="Website Address" required>
              <div class="flex">
                <UInput
                  v-model="form.subdomain"
                  size="lg"
                  placeholder="your-restaurant"
                  :disabled="loading"
                  @input="validateSubdomain"
                  class="rounded-r-none"
                />
                <div class="px-4 py-2.5 bg-stone-100 border border-l-0 border-stone-300 rounded-r-lg text-stone-600 flex items-center">
                  .krabiclaw.com
                </div>
              </div>
            </UFormGroup>
            
            <!-- Live URL Preview -->
            <div class="mt-4 p-3 bg-stone-50 rounded-lg">
              <p class="text-sm text-stone-600">Your website will be available at:</p>
              <p class="text-lg font-medium text-stone-900 mt-1">
                {{ form.subdomain || 'your-restaurant' }}.krabiclaw.com
              </p>
            </div>
            
            <!-- Subdomain Validation Messages -->
            <div class="mt-2">
              <UAlert
                v-if="subdomainStatus.available === false"
                color="red"
                variant="soft"
                icon="i-heroicons-x-circle"
              >
                {{ subdomainStatus.message }}
              </UAlert>
              <UAlert
                v-else-if="subdomainStatus.available === true"
                color="green"
                variant="soft"
                icon="i-heroicons-check-circle"
              >
                {{ subdomainStatus.message }}
              </UAlert>
              <p v-else class="text-sm text-stone-500">
                {{ subdomainStatus.message }}
              </p>
            </div>
            
            <p class="mt-2 text-xs text-stone-500">
              Use 3-63 characters: lowercase letters, numbers, and hyphens
            </p>
          </div>

          <div class="mt-8 flex justify-between">
            <UButton
              @click="previousStep"
              variant="ghost"
              color="gray"
              size="lg"
            >
              <Icon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
              Back
            </UButton>
            <UButton
              @click="nextStep"
              :disabled="!form.subdomain.trim() || subdomainStatus.available !== true"
              color="black"
              size="lg"
            >
              Next
              <Icon name="i-heroicons-arrow-right" class="w-4 h-4 ml-1" />
            </UButton>
          </div>
        </div>

        <!-- Step 3: Confirm -->
        <div v-if="currentStep === 3">
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-stone-900 mb-2">Review and create</h3>
            <p class="text-stone-600">Please review your details before creating the website.</p>
          </div>
          
          <!-- Review Summary -->
          <div class="space-y-4">
            <div class="p-4 bg-stone-50 rounded-lg">
              <h4 class="font-medium text-stone-900 mb-2">Restaurant Details</h4>
              <div class="space-y-2">
                <div class="flex justify-between">
                  <span class="text-sm text-stone-600">Name:</span>
                  <span class="text-sm font-medium text-stone-900">{{ form.restaurantName }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-stone-600">Website:</span>
                  <span class="text-sm font-medium text-stone-900">{{ form.subdomain }}.krabiclaw.com</span>
                </div>
              </div>
            </div>

            <!-- Features -->
            <div class="p-4 bg-blue-50 rounded-lg">
              <h4 class="font-medium text-stone-900 mb-3">What you'll get:</h4>
              <div class="space-y-2">
                <div class="flex items-center text-sm text-stone-700">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Beautiful restaurant website
                </div>
                <div class="flex items-center text-sm text-stone-700">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Free subdomain ({{ form.subdomain }}.krabiclaw.com)
                </div>
                <div class="flex items-center text-sm text-stone-700">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Easy content editing
                </div>
                <div class="flex items-center text-sm text-stone-700">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Mobile-friendly design
                </div>
              </div>
            </div>

            <div class="text-sm text-stone-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Icon name="i-heroicons-light-bulb" class="w-4 h-4 text-amber-600 mr-1" />
              You can connect Google Business and edit everything manually for free after creation.
            </div>
          </div>

          <div class="mt-8 flex justify-between">
            <UButton
              @click="previousStep"
              variant="ghost"
              color="gray"
              size="lg"
            >
              <Icon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" />
              Back
            </UButton>
            <UButton
              type="submit"
              :disabled="loading || !isFormValid"
              :loading="loading"
              color="black"
              size="lg"
            >
              <template v-if="loading">
                Creating your website...
              </template>
              <template v-else>
                Create Your Website
              </template>
            </UButton>
          </div>
        </div>
      </form>
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

// Step state
const currentStep = ref(1)

// Subdomain validation state
const subdomainStatus = ref({
  available: null,
  message: 'Enter your desired subdomain'
})

// Navigation functions
function nextStep() {
  if (currentStep.value < 3) {
    currentStep.value++
  }
}

function previousStep() {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

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
    if (!status.needsOnboarding && status.sites.length > 0) {
      // User already has active site, redirect to dashboard
      await navigateTo('/dashboard')
    }
  } catch (error) {
    console.error('Error checking onboarding status:', error)
    // Stay on onboarding page if status check fails
  }
})
</script>
