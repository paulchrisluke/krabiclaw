<template>
  <UPage>
    <UPageBody>
      <div class="mx-auto max-w-lg py-16 text-center">
        <div class="mb-8">
          <div class="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
            <UIcon name="i-lucide-bot" class="size-8 text-primary" />
          </div>
          <h1 class="text-3xl font-bold text-highlighted">Create your restaurant workspace</h1>
          <p class="mt-2 text-muted">Give your restaurant a name and ChowBot will handle the rest.</p>
        </div>

        <UCard>
          <UFormField label="Restaurant Name" description="This will be your brand name across your website." required>
            <UInput
              v-model="restaurantName"
              placeholder="Kikuzuki Thonglor"
              size="xl"
              autofocus
              :disabled="loading"
              @keydown.enter="handleContinue"
            />
          </UFormField>

          <UFormField class="mt-4" label="Your web address" :error="subdomainError">
            <UInput
              :model-value="previewUrl"
              readonly
              size="xl"
              class="font-mono text-muted"
            />
          </UFormField>

          <UAlert
            v-if="createError"
            color="error"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            :description="createError"
            class="mt-4"
          />

          <div class="mt-6">
            <UButton
              block
              size="xl"
              icon="i-lucide-bot"
              :disabled="!isValid || loading"
              :loading="loading"
              @click="handleContinue"
            >
              Continue with ChowBot
            </UButton>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', ssr: false })

const config = useRuntimeConfig()
const loading = ref(false)
const createError = ref('')
const restaurantName = ref('')
const subdomainError = ref('')
const subdomainAvailable = ref(true)

function generateSubdomain(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63)
}

const subdomain = computed(() => restaurantName.value ? generateSubdomain(restaurantName.value) : '')

const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  return domain.replace(/^https?:\/\//, '')
})

const previewUrl = computed(() =>
  subdomain.value ? `${subdomain.value}.${platformHostname.value}` : `your-restaurant.${platformHostname.value}`
)

const isValid = computed(() =>
  !!restaurantName.value.trim() && !!subdomain.value && subdomainAvailable.value
)

let checkTimer: ReturnType<typeof setTimeout> | undefined
let checkAbort: AbortController | null = null

watch(subdomain, (val) => {
  clearTimeout(checkTimer)
  checkAbort?.abort()
  subdomainError.value = ''
  subdomainAvailable.value = true
  if (!val) return

  checkTimer = setTimeout(async () => {
    checkAbort = new AbortController()
    const requested = val
    try {
      const res = await $fetch<{ available: boolean; message?: string }>(
        '/api/onboarding/validate-subdomain',
        { method: 'POST', body: { subdomain: val }, signal: checkAbort.signal }
      )
      if (requested === subdomain.value) {
        subdomainAvailable.value = res.available
        if (!res.available) subdomainError.value = res.message || 'Subdomain is not available.'
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    }
  }, 400)
})

onUnmounted(() => {
  clearTimeout(checkTimer)
  checkAbort?.abort()
})

async function handleContinue() {
  if (!isValid.value || loading.value) return
  loading.value = true
  createError.value = ''

  try {
    await $fetch<{ restaurantId: string }>('/api/onboarding/create-site', {
      method: 'POST',
      body: { restaurantName: restaurantName.value.trim(), subdomain: subdomain.value }
    })
    await useDashboardRestaurant().refresh()
    await navigateTo('/dashboard')
  } catch (err) {
    const msg = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { message?: string } }).data?.message
      : (err instanceof Error ? err.message : 'Failed to create restaurant')
    createError.value = msg || 'Failed to create restaurant. Please try again.'
    if (createError.value.toLowerCase().includes('taken') || createError.value.toLowerCase().includes('subdomain')) {
      subdomainAvailable.value = false
      subdomainError.value = 'This subdomain is already taken.'
    }
  } finally {
    loading.value = false
  }
}

useSeoMeta({ title: 'Create Restaurant | KrabiClaw', robots: 'noindex, nofollow' })
</script>
