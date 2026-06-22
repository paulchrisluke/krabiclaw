<template>
  <div class="min-h-screen flex items-center justify-center bg-(--ui-bg) px-6 py-12">
    <div class="w-full max-w-xs">

      <!-- Header -->
      <div class="mb-6">
        <img src="/krabi-claw-logo.png" alt="KrabiClaw Logo" class="h-8 mb-4">
        <h1 class="text-2xl font-bold text-default tracking-tight mt-0.5">
          {{ clientName || 'This app' }} wants to access your KrabiClaw Account.
        </h1>
      </div>

      <!-- Signed-in account -->
      <div v-if="currentUser" class="mb-6">
        <p class="text-sm text-muted">
          Logged in as <span class="text-default font-medium">{{ currentUser.name || currentUser.email }}</span>.
          <NuxtLink
            :href="`/oauth/login${$route.fullPath.slice($route.path.length)}`"
            class="text-primary hover:underline ml-1"
          >
            (Not you?)
          </NuxtLink>
        </p>
      </div>

      <!-- Permissions -->
      <div class="mb-8">
        <p class="text-sm font-bold text-default mb-4">
          You agree that <span class="font-bold">{{ clientName || 'this app' }}</span> will be able to:
        </p>

        <div class="space-y-5">
          <div
            v-for="group in permissionGroups"
            :key="group.title"
            class="flex items-start gap-3"
          >
            <UIcon :name="group.icon" class="w-5 h-5 text-default shrink-0 mt-0.5" />
            <div>
              <p class="text-sm font-bold text-default">{{ group.title }}</p>
              <ul class="mt-1 space-y-0.5">
                <li
                  v-for="item in group.items"
                  :key="item"
                  class="text-sm text-muted"
                >
                  • {{ item }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-4" />

      <UButton
        id="oauth-consent-agree"
        block
        size="lg"
        :loading="accepting"
        :disabled="denying"
        class="rounded-full"
        @click="accept"
      >
        Agree
      </UButton>

      <button
        id="oauth-consent-cancel"
        class="w-full text-sm text-muted hover:text-default transition-colors text-center mt-3 py-1"
        :disabled="accepting"
        @click="deny"
      >
        <span v-if="denying" class="opacity-60">Cancelling…</span>
        <span v-else>Cancel</span>
      </button>

      <!-- Legal footnotes -->
      <div class="mt-6 space-y-2">
        <p class="text-xs text-dimmed">
          You can remove this access at any time in your
          <NuxtLink href="/dashboard/account/settings" class="underline underline-offset-2 hover:text-default transition-colors">account settings</NuxtLink>.
        </p>
        <p class="text-xs text-dimmed">
          To learn more about how {{ clientName || 'this app' }} collects, uses, shares and protects your personal data please read
          <span class="font-medium">{{ clientName ? `${clientName}'s` : "the App's" }} Privacy Policy</span>.
        </p>
      </div>

    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false, auth: false })

useSeoMeta({ robots: 'noindex, nofollow' })

const route = useRoute()

// ── Client metadata ───────────────────────────────────────────────────────────
const clientName = ref('')
const currentUser = ref(null)

onMounted(async () => {
  const clientId = route.query.client_id

  // Check session and pre-fetch client name in parallel
  const [sessionResult] = await Promise.allSettled([
    authClient.getSession(),
    clientId && typeof clientId === 'string'
      ? $fetch('/api/auth/oauth2/public-client-prelogin', {
          method: 'POST',
          body: { client_id: clientId, oauth_query: window.location.search.slice(1) },
        }).then((data) => { if (data?.client_name) clientName.value = data.client_name }).catch(() => {})
      : Promise.resolve(),
  ])

  if (sessionResult.status === 'fulfilled' && sessionResult.value?.data?.user) {
    currentUser.value = sessionResult.value.data.user
    // Auto-accept when the user has already consented to this client.
    // This makes "Always allow" re-auth in ChatGPT seamless — the consent page
    // silently completes and redirects back without requiring another click.
    if (clientId && typeof clientId === 'string') {
      try {
        const status = await $fetch<{ hasConsented: boolean }>('/api/auth/oauth2/consent-status', {
          query: { client_id: clientId },
        })
        if (status.hasConsented) {
          await accept()
          return
        }
      } catch {
        // Non-fatal — fall through to show manual UI
      }
    }
  }
})

// ── Permission groups ─────────────────────────────────────────────────────────
const requestedScopes = computed(() => {
  const raw = route.query.scope
  if (!raw || typeof raw !== 'string') return ['openid', 'tenant']
  return raw.split(' ').filter(Boolean)
})

const permissionGroups = computed(() => {
  const scopes = new Set(requestedScopes.value)
  const groups = []

  if (scopes.has('openid')) {
    groups.push({
      icon: 'i-lucide-fingerprint',
      title: 'Verify your identity',
      items: ['Confirm you are who you say you are'],
    })
  }

  if (scopes.has('tenant')) {
    groups.push({
      icon: 'i-lucide-layout-dashboard',
      title: 'Access your KrabiClaw workspace',
      items: [
        'Read and update your site content, menus, and media',
        'Manage locations, reviews, and Q&A',
        'Submit and track work requests',
      ],
    })
  }

  if (scopes.has('platform_admin')) {
    groups.push({
      icon: 'i-lucide-shield-check',
      title: 'Access internal platform operations',
      items: [
        'Manage KrabiClaw platform blog and docs content',
        'Perform internal platform admin actions',
      ],
    })
  }

  // We hide offline_access from the UI (matching Spotify's transparent refresh token behavior)

  const known = new Set(['openid', 'tenant', 'platform_admin', 'offline_access'])
  const unknown = [...scopes].filter(s => !known.has(s))
  if (unknown.length) {
    groups.push({
      icon: 'i-lucide-key',
      title: 'Additional permissions',
      items: unknown,
    })
  }

  return groups
})

// ── Actions ───────────────────────────────────────────────────────────────────
const accepting = ref(false)
const denying = ref(false)
const error = ref(null)

async function accept() {
  accepting.value = true
  error.value = null
  try {
    const result = await $fetch('/api/auth/oauth2/consent', {
      method: 'POST',
      body: { accept: true, oauth_query: window.location.search.slice(1) },
    })
    if (result?.url) window.location.href = result.url
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
    if (result?.url) window.location.href = result.url
  } catch (err) {
    error.value = err?.data?.message ?? err?.message ?? 'Something went wrong. Please try again.'
  } finally {
    denying.value = false
  }
}
</script>
