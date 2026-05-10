<template>
  <UPage>
    <UPageHeader
      title="Set up your restaurant"
      description="Get your website live in a few steps."
    />

    <UPageBody>
      <div class="mx-auto max-w-2xl">
        <UCard>
          <UStepper v-model="currentStep" :items="steps" class="mb-8" />

          <!-- Step 1: Restaurant Info -->
          <div v-if="currentStep === 0" class="space-y-6">
            <UFormField
              label="Restaurant Name"
              description="This will be your brand name across your website."
            >
              <UInput
                v-model="form.restaurantName"
                placeholder="Your Restaurant Name"
                size="xl"
                :disabled="loading"
              />
            </UFormField>

            <UFormField
              label="Website Address"
              description="Your website will be available at this address."
              :error="subdomainError"
            >
              <UInput
                :model-value="`${generatedSubdomain || 'your-restaurant'}.${platformHostname}`"
                readonly
                size="xl"
                class="font-mono"
              />
            </UFormField>

            <UAlert
              v-if="step1Error"
              color="error"
              variant="soft"
              icon="i-heroicons-exclamation-triangle"
              :description="step1Error"
            />

            <div class="flex justify-end">
              <UButton
                :disabled="!isStep1Valid || loading"
                :loading="loading"
                @click="handleStep1Next"
              >
                Continue
              </UButton>
            </div>
          </div>

          <!-- Step 2: Primary Location -->
          <div v-else-if="currentStep === 1" class="space-y-6">
            <!-- Places search -->
            <UFormField label="Find on Google" hint="Search to auto-fill details">
              <UInput
                v-model="placesQuery"
                placeholder="Search your restaurant on Google…"
                icon="i-heroicons-magnifying-glass"
                size="xl"
                :loading="placesSearching"
                :disabled="loading"
                @input="onPlacesInput"
              />
              <div v-if="placesResults.length" class="mt-1 overflow-hidden rounded-md border border-(--ui-border) bg-(--ui-bg) shadow-sm">
                <button
                  v-for="result in placesResults"
                  :key="result.placeId"
                  type="button"
                  class="flex w-full flex-col px-4 py-3 text-left text-sm hover:bg-(--ui-bg-elevated)"
                  @click="selectPlace(result.placeId)"
                >
                  <span class="font-medium text-(--ui-text-highlighted)">{{ result.name }}</span>
                  <span class="text-xs text-(--ui-text-muted)">{{ result.formattedAddress }}</span>
                </button>
              </div>
            </UFormField>

            <div class="flex items-center gap-1.5">
              <div class="h-px flex-1 bg-(--ui-border)" />
              <span class="text-xs text-(--ui-text-muted)">or fill in manually</span>
              <div class="h-px flex-1 bg-(--ui-border)" />
            </div>

            <UFormField label="Location Name">
              <UInput
                v-model="form.locationName"
                placeholder="Kikuzuki Thonglor"
                size="xl"
                :disabled="loading"
              />
            </UFormField>

            <UFormField label="City">
              <UInput
                v-model="form.city"
                placeholder="Bangkok"
                size="xl"
                :disabled="loading"
              />
            </UFormField>

            <UFormField label="Phone Number" hint="Optional">
              <UInput
                v-model="form.phone"
                type="tel"
                placeholder="+66 2 123 4567"
                size="xl"
                :disabled="loading"
              />
            </UFormField>

            <UAlert
              v-if="step2Error"
              color="error"
              variant="soft"
              icon="i-heroicons-exclamation-triangle"
              :description="step2Error"
            />

            <div class="flex items-center justify-between">
              <UButton color="neutral" variant="ghost" :disabled="loading" @click="currentStep--">
                Back
              </UButton>
              <UButton
                :disabled="!isStep2Valid || loading"
                :loading="loading"
                @click="handleStep2Next"
              >
                Continue
              </UButton>
            </div>
          </div>

          <!-- Step 3: Success -->
          <div v-else-if="currentStep === 2" class="space-y-6 text-center">
            <div class="flex justify-center">
              <div class="flex size-16 items-center justify-center rounded-full bg-(--ui-bg-elevated)">
                <UIcon name="i-heroicons-check-circle" class="size-10 text-(--ui-success)" />
              </div>
            </div>

            <div>
              <h2 class="text-2xl font-bold text-(--ui-text-highlighted)">Your website is ready!</h2>
              <p class="mt-2 text-(--ui-text-muted)">
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
                Open Website Dashboard
              </UButton>
              <UButton
                to="/dashboard"
                color="neutral"
                variant="soft"
                size="xl"
                block
              >
                Back to Dashboard
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', ssr: false })

const config = useRuntimeConfig()
const toast = useToast()

const steps = [
  { label: 'Restaurant Info' },
  { label: 'Primary Location' },
  { label: 'Done' }
]

const currentStep = ref(0)
const loading = ref(false)
const createdSiteId = ref<string | null>(null)
const step1Error = ref('')
const step2Error = ref('')

const form = ref({
  restaurantName: '',
  subdomain: '',
  locationName: '',
  city: '',
  phone: '',
  address: '',
  mapsUrl: '',
  websiteUrl: '',
  openingHours: null as string[] | null,
})

// Google Places autocomplete
interface PlaceSearchResult { placeId: string; name: string; formattedAddress: string }
const placesQuery = ref('')
const placesResults = ref<PlaceSearchResult[]>([])
const placesSearching = ref(false)
let placesTimer: ReturnType<typeof setTimeout> | null = null

const onPlacesInput = () => {
  placesResults.value = []
  if (placesTimer) clearTimeout(placesTimer)
  const q = placesQuery.value.trim()
  if (q.length < 2) return
  placesTimer = setTimeout(() => doPlacesSearch(q), 400)
}

const doPlacesSearch = async (query: string) => {
  placesSearching.value = true
  try {
    const res = await $fetch<{ success: boolean; results: PlaceSearchResult[] }>(
      '/api/places/search', { method: 'POST', body: { query } } as any
    )
    if (res.success) placesResults.value = res.results
  } catch { /* ignore — manual entry still works */ }
  finally { placesSearching.value = false }
}

const selectPlace = async (placeId: string) => {
  placesResults.value = []
  placesSearching.value = true
  try {
    const res = await $fetch<{ success: boolean; details: any }>(`/api/places/${placeId}`)
    if (!res.success) return
    const d = res.details
    form.value.locationName = d.name || form.value.locationName
    form.value.city = d.city || form.value.city
    form.value.phone = d.phone || form.value.phone
    form.value.address = d.formattedAddress || ''
    form.value.mapsUrl = d.mapsUrl || ''
    form.value.websiteUrl = d.websiteUrl || ''
    form.value.openingHours = d.openingHours || null
    placesQuery.value = d.name || ''
  } catch { /* ignore */ }
  finally { placesSearching.value = false }
}

const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  if (!domain) return ''
  try {
    const urlStr = domain.startsWith('http') ? domain : `https://${domain}`
    return new URL(urlStr).hostname
  } catch {
    return domain.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  }
})

const generateSubdomain = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63)

const generatedSubdomain = computed(() =>
  form.value.restaurantName ? generateSubdomain(form.value.restaurantName) : ''
)

watch(() => form.value.restaurantName, (name) => {
  form.value.subdomain = name ? generateSubdomain(name) : ''
})

const subdomainAvailable = ref(true)
const subdomainError = ref('')
let subdomainCheckTimeout: ReturnType<typeof setTimeout> | undefined
let subdomainAbortController: AbortController | null = null

watch(() => form.value.subdomain, (newSubdomain) => {
  clearTimeout(subdomainCheckTimeout)
  subdomainAbortController?.abort()
  subdomainError.value = ''

  if (!newSubdomain) {
    subdomainAvailable.value = true
    return
  }

  subdomainCheckTimeout = setTimeout(async () => {
    subdomainAbortController = new AbortController()
    const requested = newSubdomain
    try {
      const { available, message } = await $fetch<{ available: boolean; message?: string }>(
        '/api/onboarding/validate-subdomain',
        { method: 'POST', body: { subdomain: newSubdomain }, signal: subdomainAbortController.signal }
      )
      if (requested === form.value.subdomain) {
        subdomainAvailable.value = available
        if (!available) subdomainError.value = message || 'Subdomain is not available.'
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
  subdomainAbortController?.abort()
})

const isStep1Valid = computed(() =>
  !!form.value.restaurantName.trim() &&
  !!form.value.subdomain.trim() &&
  subdomainAvailable.value
)

const isStep2Valid = computed(() => !!form.value.locationName.trim())

async function handleStep1Next() {
  if (!isStep1Valid.value || loading.value) return
  loading.value = true
  step1Error.value = ''
  try {
    const response = await $fetch<{ siteId: string }>('/api/onboarding/create-site', {
      method: 'POST',
      body: {
        restaurantName: form.value.restaurantName.trim(),
        subdomain: form.value.subdomain.toLowerCase().trim()
      }
    })
    createdSiteId.value = response.siteId
    // Pre-fill location name from restaurant name if not already set via Places
    if (!form.value.locationName.trim()) {
      form.value.locationName = form.value.restaurantName.trim()
    }
    currentStep.value++
  } catch (error: any) {
    const isTaken =
      error.response?.status === 409 ||
      error.data?.code === 'subdomain_taken' ||
      error.data?.message?.includes('taken')
    if (isTaken) {
      subdomainAvailable.value = false
      subdomainError.value = 'Subdomain is already taken.'
    } else {
      step1Error.value = error.data?.message || error.message || 'Error creating site.'
    }
  } finally {
    loading.value = false
  }
}

async function handleStep2Next() {
  if (!isStep2Valid.value || loading.value || !createdSiteId.value) return
  loading.value = true
  step2Error.value = ''
  try {
    await $fetch(`/api/sites/${createdSiteId.value}/locations`, {
      method: 'POST',
      body: {
        title: form.value.locationName.trim(),
        slug: generateSubdomain(form.value.locationName),
        city: form.value.city.trim() || null,
        phone: form.value.phone.trim() || null,
        address: form.value.address ? { addressLines: [form.value.address] } : undefined,
        maps_url: form.value.mapsUrl || null,
        website_url: form.value.websiteUrl || null,
        opening_hours: form.value.openingHours ? { weekdayDescriptions: form.value.openingHours } : undefined,
        is_primary: true
      }
    })
    currentStep.value++
  } catch (error: any) {
    step2Error.value = error.data?.message || error.message || 'Failed to create location. Please try again.'
  } finally {
    loading.value = false
  }
}

useSeoMeta({ title: 'Set Up Restaurant | KrabiClaw', robots: 'noindex, nofollow' })
</script>
