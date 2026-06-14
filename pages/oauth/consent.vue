<template>
  <div class="min-h-screen flex items-center justify-center bg-(--ui-bg) px-4">
    <div class="w-full max-w-md">
      <UCard :ui="{ root: 'shadow-lg' }">
        <template #header>
          <div class="text-center py-2">
            <div class="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4 overflow-hidden bg-elevated">
              <img v-if="clientIcon" :src="clientIcon" :alt="clientName" class="w-full h-full object-cover" />
              <UIcon v-else name="i-lucide-link" class="w-7 h-7 text-(--kc-coral-600)" />
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

const clientName = ref('An external application')
const clientIcon = ref(null)

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

// Fetch real client metadata so we show the registered name/icon, not a guess
onMounted(async () => {
  const clientId = route.query.client_id
  if (!clientId || typeof clientId !== 'string') return
  try {
    const data = await $fetch('/api/auth/oauth2/public-client-prelogin', {
      method: 'POST',
      body: { client_id: clientId, oauth_query: window.location.search.slice(1) },
    })
    if (data?.client_name) clientName.value = data.client_name
    if (data?.logo_uri) clientIcon.value = data.logo_uri
  } catch {
    // Fall back to client_id if the lookup fails — non-fatal
  }
})

const accepting = ref(false)
const denying = ref(false)
const error = ref(null)

async function accept() {
  accepting.value = true
  error.value = null
  try {
    // authClient.api.* adds an extra /api/ segment; call the endpoint directly
    const result = await $fetch('/api/auth/oauth2/consent', {
      method: 'POST',
      body: { accept: true, oauth_query: window.location.search.slice(1) },
    })
    if (result?.redirect_uri) window.location.href = result.redirect_uri
  } catch (err) {
    error.value = err?.data?.message ?? err?.message ?? 'Something went wrong. Please try again.'
  } finally {
    accepting.value = false
  }
}

async function deny() {
  denying.value = true
  error.value = null
  try {
    const result = await $fetch('/api/auth/oauth2/consent', {
      method: 'POST',
      body: { accept: false, oauth_query: window.location.search.slice(1) },
    })
    if (result?.redirect_uri) window.location.href = result.redirect_uri
  } catch (err) {
    error.value = err?.data?.message ?? err?.message ?? 'Something went wrong. Please try again.'
  } finally {
    denying.value = false
  }
}
</script>
