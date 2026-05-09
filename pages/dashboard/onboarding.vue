<template>
  <div class="min-h-screen bg-[var(--ui-bg-muted)]">
    <div class="max-w-2xl mx-auto pt-16 pb-12 px-4">
      <!-- KrabiClaw Branding -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-[var(--ui-text-highlighted)] mb-2">
          Welcome to KrabiClaw
        </h1>
        <p class="text-[var(--ui-text-muted)]">
          Let's set up your restaurant website
        </p>
      </div>

      <!-- Onboarding Wizard -->
      <UCard class="shadow-sm">
        <UStepper v-model="currentStep" :items="steps" />

        <div class="mt-8">
          <!-- Step 1: Restaurant Info -->
          <div v-if="currentStep === 0" class="space-y-6">
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

            <UFormField 
              label="Website Address" 
              description="Your website will be automatically created at this address"
              :error="subdomainError"
            >
              <div class="flex items-center px-4 py-3 bg-[var(--ui-bg-elevated)] border border-[var(--ui-border)] rounded-lg text-[var(--ui-text-muted)]">
                <span class="font-mono">{{ generatedSubdomain || 'your-restaurant' }}.{{ platformHostname }}</span>
              </div>
            </UFormField>

            <div class="flex justify-end">
              <UButton
                :disabled="!isStep1Valid || loading"
                :loading="loading"
                @click="handleStep1Next"
              >
                Next
              </UButton>
            </div>
          </div>

          <!-- Step 2: Primary Location -->
          <div v-if="currentStep === 1" class="space-y-6">
            <UFormField label="Location Name" description="Name of your restaurant location">
              <UInput
                v-model="form.locationName"
                type="text"
                required
                :disabled="loading"
                placeholder="Kikuzuki Thonglor"
                size="xl"
              />
            </UFormField>

            <UFormField label="City" description="City where your restaurant is located">
              <UInput
                v-model="form.city"
                type="text"
                required
                :disabled="loading"
                placeholder="Bangkok"
                size="xl"
              />
            </UFormField>

            <UFormField label="Phone Number" description="Contact phone for customers">
              <UInput
                v-model="form.phone"
                type="tel"
                required
                :disabled="loading"
                placeholder="+66 2 123 4567"
                size="xl"
              />
            </UFormField>

            <div class="flex justify-between">
              <UButton
                variant="ghost"
                color="neutral"
                :disabled="loading"
                @click="currentStep--"
              >
                Back
              </UButton>
              <UButton
                :disabled="!isStep2Valid || loading"
                :loading="loading"
                @click="handleStep2Next"
              >
                Next
              </UButton>
            </div>
          </div>

          <!-- Step 3: Done -->
          <div v-if="currentStep === 2" class="text-center space-y-6">
            <div class="flex justify-center">
              <div class="size-16 rounded-full bg-green-100 flex items-center justify-center">
                <UIcon name="i-heroicons-check" class="size-8 text-green-600" />
              </div>
            </div>
            
            <div>
              <h2 class="text-2xl font-bold text-[var(--ui-text-highlighted)] mb-2">
                Your website is ready!
              </h2>
              <p class="text-[var(--ui-text-muted)]">
                {{ form.restaurantName }} has been created successfully.
              </p>
            </div>

            <div class="space-y-3">
              <UButton
                :to="`/dashboard/sites/${createdSiteId}`"
                color="primary"
                size="xl"
                block
              >
                View Your Website
              </UButton>
              <UButton
                to="/dashboard/sites"
                variant="outline"
                color="neutral"
                size="xl"
                block
              >
                Go to Dashboard
              </UButton>
            </div>
          </div>
        </div>
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

const steps = [
  { label: 'Restaurant Info' },
  { label: 'Primary Location' },
  { label: 'Done' }
]

const currentStep = ref(0)
const loading = ref(false)
const createdSiteId = ref<string | null>(null)

const form = ref({
  restaurantName: '',
  subdomain: '',
  locationName: '',
  city: '',
  phone: ''
})

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

const generateSubdomain = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63)
}

const generatedSubdomain = computed(() => {
  if (!form.value.restaurantName) return ''
  return generateSubdomain(form.value.restaurantName)
})

watch(() => form.value.restaurantName, (newName) => {
  if (newName) {
    form.value.subdomain = generateSubdomain(newName)
  }
})

const subdomainAvailable = ref(true)
const subdomainError = ref('')

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

const isStep1Valid = computed(() => {
  return (
    form.value.restaurantName.trim() &&
    form.value.subdomain.trim() &&
    subdomainAvailable.value
  )
})

const isStep2Valid = computed(() => {
  return (
    form.value.locationName.trim() &&
    form.value.city.trim() &&
    form.value.phone.trim()
  )
})

async function handleStep1Next() {
  if (!isStep1Valid.value || loading.value) return

  loading.value = true

  try {
    const response = await $fetch<{ siteId: string }>('/api/onboarding/create-site', {
      method: 'POST',
      body: {
        restaurantName: form.value.restaurantName.trim(),
        subdomain: form.value.subdomain.toLowerCase().trim()
      }
    })
    
    createdSiteId.value = response.siteId
    currentStep.value++
  } catch (error: any) {
    const isTaken = error.response?.status === 409 || error.data?.code === 'subdomain_taken' || error.data?.message?.includes('taken')
    if (isTaken) {
      subdomainAvailable.value = false
      subdomainError.value = 'Subdomain is already taken.'
    } else {
      subdomainError.value = error.data?.message || error.message || 'Error creating site.'
    }
  } finally {
    loading.value = false
  }
}

async function handleStep2Next() {
  if (!isStep2Valid.value || loading.value || !createdSiteId.value) return

  loading.value = true

  try {
    await $fetch(`/api/sites/${createdSiteId.value}/locations`, {
      method: 'POST',
      body: {
        title: form.value.locationName.trim(),
        slug: generateSubdomain(form.value.locationName),
        city: form.value.city.trim(),
        phone: form.value.phone.trim(),
        is_primary: true
      }
    })
    
    currentStep.value++
  } catch (error: any) {
    console.error('Failed to create location:', error)
    alert('Failed to create location. Please try again.')
  } finally {
    loading.value = false
  }
}
</script>
