<template>
  <div class="min-h-screen bg-(--ui-bg-muted) ">
    <div class="max-w-2xl mx-auto pt-16 pb-12 px-4">
      <!-- KrabiClaw Branding -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-(--ui-text-highlighted)  mb-2">
          Welcome to KrabiClaw
        </h1>
        <p class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">
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
              size="xl"
            />
          </UFormField>

          <!-- Website Address -->
          <UFormField 
            label="Website Address" 
            description="Your website will be automatically created at this address"
            :error="subdomainError"
          >
            <div class="flex items-center px-4 py-3 bg-(--ui-bg-elevated)  border border-gray-300 dark:border-gray-700 rounded-lg text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">
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
              size="xl"
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
            <h3 class="text-sm font-medium text-(--ui-text-highlighted) ">What you'll get:</h3>
            <div class="space-y-3">
              <div class="flex items-center text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mr-2" />
                Beautiful restaurant website
              </div>
              <div class="flex items-center text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mr-2" />
                Free subdomain ({{ generatedSubdomain || 'your-restaurant' }}.{{ platformHostname }})
              </div>
              <div class="flex items-center text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-green-500 mr-2" />
                Easy content editing
              </div>
              <div class="flex items-center text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">
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

<script setup lang="ts">

definePageMeta({
  layout: 'dashboard',
  ssr: false
})

const router = useRouter()
const config = useRuntimeConfig()

// Extract hostname from config for URLs
const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  if (!domain) return ''
  try {
    const urlStr = domain.startsWith('http') ? domain : `https://${domain}`
    return new URL(urlStr).hostname
  } catch (e) {
    return domain.replace(/^https?:\/\//, '').split('/')[0]
  }
})

// Form state
const form = ref({
  restaurantName: '',
  subdomain: ''
})

// Auto-generate subdomain from restaurant name
const generateSubdomain = (name: string) => {
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

// Subdomain availability state
const subdomainAvailable = ref(true)
const subdomainError = ref('')

// Debounced check for subdomain availability
let subdomainCheckTimeout: ReturnType<typeof setTimeout> | undefined
let subdomainAbortController: AbortController | null = null

watch(() => form.value.subdomain, (newSubdomain) => {
  clearTimeout(subdomainCheckTimeout)
  if (subdomainAbortController) {
    subdomainAbortController.abort()
  }
  
  subdomainError.value = ''
  if (!newSubdomain) {
    subdomainAvailable.value = true
    return
  }
  
  subdomainCheckTimeout = setTimeout(async () => {
    subdomainAbortController = new AbortController()
    const requested = newSubdomain
    
    try {
      const { available, message } = await $fetch<{ available: boolean, message?: string }>('/api/onboarding/validate-subdomain', {
        method: 'POST',
        body: { subdomain: newSubdomain },
        signal: subdomainAbortController.signal
      })
      
      if (requested === form.value.subdomain) {
        subdomainAvailable.value = available
        if (!available) {
          subdomainError.value = message || 'Subdomain is not available.'
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return
      
      if (requested === form.value.subdomain) {
        subdomainAvailable.value = false
        subdomainError.value = e.data?.message || e.message || 'Error checking subdomain availability.'
      }
    }
  }, 400)
})

onUnmounted(() => {
  clearTimeout(subdomainCheckTimeout)
  if (subdomainAbortController) {
    subdomainAbortController.abort()
  }
})

// Form validation
const isFormValid = computed(() => {
  return (
    form.value.restaurantName.trim() &&
    form.value.subdomain.trim() &&
    subdomainAvailable.value
  )
})

// Handle form submission
async function handleSubmit() {
  if (!isFormValid.value || loading.value) return

  loading.value = true

  try {
    const response = await $fetch<{ siteId: string }>('/api/onboarding/create-site', {
      method: 'POST',
      body: {
        restaurantName: form.value.restaurantName.trim(),
        subdomain: form.value.subdomain.toLowerCase().trim()
      }
    })
    
    // Redirect to dashboard or site editor
    await router.push(`/dashboard/sites/${response.siteId}`)
  } catch (error: any) {
    loading.value = false
    const isTaken = error.response?.status === 409 || error.data?.code === 'subdomain_taken' || error.data?.message?.includes('taken')
    if (isTaken) {
      subdomainAvailable.value = false
      subdomainError.value = 'Subdomain is already taken.'
    } else {
      subdomainError.value = error.data?.message || error.message || 'Error creating site.'
    }
  }
}

</script>
