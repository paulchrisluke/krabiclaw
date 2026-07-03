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
          Logged in as <span class="text-default font-medium">{{ currentUser.name || currentUser.email }}</span>
          <span v-if="currentUser.name" class="text-dimmed"> · {{ currentUser.email }}</span>.
          <button
            type="button"
            class="text-primary hover:underline ml-1"
            :disabled="switchingAccount"
            @click="switchAccount"
          >
            {{ switchingAccount ? 'Signing out…' : '(Not you?)' }}
          </button>
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
            <!-- Dynamic SVG Icons based on group.icon -->
            <svg v-if="group.icon === 'i-lucide-fingerprint'" class="w-5 h-5 text-default shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>
            <svg v-else-if="group.icon === 'i-lucide-layout-dashboard'" class="w-5 h-5 text-default shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            <svg v-else-if="group.icon === 'i-lucide-shield-check'" class="w-5 h-5 text-default shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2-1 4-3 5.33-4.33a2 2 0 0 1 2.82 0C14.49 2 16.28 3 18.28 4a1 1 0 0 1 1 1v6z"/><path d="m9 12 2 2 4-4"/></svg>
            <svg v-else class="w-5 h-5 text-default shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
            
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
      <div v-if="error" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
        {{ error }}
      </div>

      <button
        id="oauth-consent-agree"
        class="w-full flex justify-center items-center py-3 px-4 rounded-full text-[15px] font-semibold shadow-sm transition-all text-white bg-black dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="accepting || denying || switchingAccount"
        @click="accept"
      >
        <svg v-if="accepting" class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Agree
      </button>

      <button
        id="oauth-consent-cancel"
        class="w-full text-sm text-muted hover:text-default transition-colors text-center mt-3 py-1"
        :disabled="accepting || switchingAccount"
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
const switchingAccount = ref(false)

/**
 * Sign out the current session and go straight to the sign-in form for a
 * different account — skips the oauth/login "Continue as X" confirmation
 * step entirely since we already know it's not this user.
 */
async function switchAccount() {
  switchingAccount.value = true
  try {
    await authClient.signOut()
  } catch (err) {
    error.value = err?.message ?? 'Could not sign out. Please try again.'
    switchingAccount.value = false
    return
  }
  window.location.href = `/oauth/login${route.fullPath.slice(route.path.length)}`
}

async function accept() {
  if (switchingAccount.value || denying.value) return
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
  if (switchingAccount.value || accepting.value) return
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
