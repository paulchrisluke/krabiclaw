<template>
  <div class="min-h-screen flex items-center justify-center bg-(--ui-bg) px-4">
    <div class="w-full max-w-md">
      <UCard :ui="{ root: 'shadow-lg' }">
        <template #header>
          <div class="text-center py-2">
            <div class="w-12 h-12 bg-(--kc-coral-50) rounded-full flex items-center justify-center mx-auto mb-4">
              <UIcon name="i-lucide-link" class="w-6 h-6 text-(--kc-coral-600)" />
            </div>
            <h1 class="text-xl font-bold text-default">Connect your account</h1>
            <p class="text-sm text-muted mt-1">
              <span class="font-semibold text-default">{{ clientName }}</span> wants to access your KrabiClaw account
            </p>
          </div>
        </template>

        <div class="space-y-3 py-2">
          <p class="text-xs font-semibold uppercase tracking-wider text-dimmed">This app will be able to:</p>
          <ul class="space-y-2">
            <li
              v-for="scope in requestedScopes"
              :key="scope"
              class="flex items-start gap-2 text-sm text-default"
            >
              <UIcon name="i-lucide-check" class="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
              {{ scopeLabel(scope) }}
            </li>
          </ul>
        </div>

        <template #footer>
          <div class="flex flex-col gap-2">
            <UAlert v-if="error" color="error" variant="soft" :description="error" />
            <UButton block :loading="accepting" :disabled="denying" @click="accept">
              Allow access
            </UButton>
            <UButton block variant="ghost" color="neutral" :loading="denying" :disabled="accepting" @click="deny">
              Deny
            </UButton>
          </div>
        </template>
      </UCard>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false, auth: false })

const route = useRoute()

const clientName = computed(() => {
  const id = route.query.client_id
  if (!id || typeof id !== 'string') return 'An external application'
  if (id.toLowerCase().includes('chatgpt') || id.toLowerCase().includes('openai')) return 'ChatGPT'
  return 'An external application'
})

const requestedScopes = computed(() => {
  const raw = route.query.scope
  if (!raw || typeof raw !== 'string') return ['openid', 'tenant']
  return raw.split(' ').filter(Boolean)
})

function scopeLabel(scope) {
  const labels = {
    openid: 'Verify your identity',
    offline_access: 'Stay connected over time (refresh tokens)',
    tenant: 'Read and manage your restaurant workspace',
  }
  return labels[scope] ?? scope
}

const accepting = ref(false)
const denying = ref(false)
const error = ref(null)

async function accept() {
  accepting.value = true
  error.value = null
  try {
    const result = await authClient.api.oauth2Consent({ body: { accept: true } })
    if (result?.data?.redirect_uri) {
      window.location.href = result.data.redirect_uri
    }
  } catch (err) {
    error.value = err?.message ?? 'Something went wrong. Please try again.'
  } finally {
    accepting.value = false
  }
}

async function deny() {
  denying.value = true
  error.value = null
  try {
    const result = await authClient.api.oauth2Consent({ body: { accept: false } })
    if (result?.data?.redirect_uri) {
      window.location.href = result.data.redirect_uri
    }
  } catch (err) {
    error.value = err?.message ?? 'Something went wrong. Please try again.'
  } finally {
    denying.value = false
  }
}
</script>
