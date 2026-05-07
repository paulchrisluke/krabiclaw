<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="max-w-2xl mx-auto pt-16 pb-12 px-4">
      <!-- KrabiClaw Branding -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome to KrabiClaw
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Let's set up your restaurant website
        </p>
      </div>

      <!-- Onboarding Form -->
      <UCard class="shadow-sm">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- Restaurant Name -->
          <UFormField label="Restaurant Name" description="This will be your brand name across your website">
            <UInput
              v-model="form.restaurantName"
              type="text"
              required
              :disabled="loading"
              placeholder="Your Restaurant Name"
              size="lg"
            />
          </UFormField>

          <!-- Website Address -->
          <UFormField 
            label="Website Address" 
            description="Your website will be automatically created at this address"
          >
            <div class="flex items-center px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400">
              <span class="font-mono">{{ generatedSubdomain || 'your-restaurant' }}.{{ platformHostname }}</span>
            </div>
          </UFormField>

          <!-- Submit Button -->
          <div class="pt-4">
            <UButton
              type="submit"
              :disabled="loading || !isFormValid"
              :loading="loading"
              color="primary"
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
        <template #footer>
          <div class="space-y-4">
            <h3 class="text-sm font-medium text-gray-900 dark:text-white">What you'll get:</h3>
            <div class="space-y-3">
              <div class="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mr-2" />
                Beautiful restaurant website
              </div>
              <div class="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mr-2" />
                Free subdomain ({{ form.subdomain || 'your-restaurant' }}.{{ platformHostname }})
              </div>
              <div class="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mr-2" />
                Easy content editing
              </div>
              <div class="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mr-2" />
                Mobile-friendly design
              </div>
            </div>
          </div>
        </template>
      </UCard>
    </div>
  </div>
</template>

<script setup>

definePageMeta({
  layout: 'dashboard',
  ssr: false
})

const router = useRouter()
const config = useRuntimeConfig()

// Extract hostname from config for URLs
const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  console.log('Raw domain from config:', domain)
  const cleanDomain = domain.replace(/^https?:\/\//, '')
  console.log('Clean hostname:', cleanDomain)
  return cleanDomain
})

// Form state
const form = ref({
  restaurantName: '',
  subdomain: ''
})

// Auto-generate subdomain from restaurant name
const generateSubdomain = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63)
}

// Generated subdomain computed property
const generatedSubdomain = computed(() => {
  if (!form.value.restaurantName) return ''
  return generateSubdomain(form.value.restaurantName)
})

// Watch restaurant name changes and update subdomain
watch(() => form.value.restaurantName, (newName) => {
  if (newName) {
    form.value.subdomain = generateSubdomain(newName)
  }
})

// Loading state
const loading = ref(false)

// Form validation
const isFormValid = computed(() => {
  return form.value.restaurantName.trim() && 
         form.value.subdomain.trim()
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
