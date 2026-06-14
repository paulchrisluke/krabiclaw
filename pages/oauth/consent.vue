<template>
  <div class="min-h-screen flex items-center justify-center bg-(--ui-bg) px-4 py-12">
    <div class="w-full max-w-sm">

      <!-- Dual-logo connection header -->
      <div class="flex items-center justify-center gap-3 mb-8">
        <div class="w-10 h-10 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
          <img v-if="clientIcon" :src="clientIcon" :alt="clientName" class="w-full h-full object-cover" />
          <UIcon v-else name="i-lucide-link" class="w-5 h-5 text-muted" />
        </div>
        <UIcon name="i-lucide-arrow-right-left" class="w-4 h-4 text-dimmed" />
        <div class="w-10 h-10 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
          <img src="/favicon-96x96.png" alt="KrabiClaw" class="w-full h-full object-cover" />
        </div>
      </div>

      <UCard :ui="{ root: 'shadow-xl' }">
        <template #header>
          <div class="text-center pt-1 pb-2">
            <p class="text-xs font-semibold uppercase tracking-widest text-dimmed mb-1">Allow {{ clientName || 'this app' }} to connect to:</p>
            <h1 class="text-2xl font-extrabold text-default tracking-tight">KrabiClaw</h1>
          </div>
        </template>

        <div class="space-y-5 py-1">

          <!-- Signed-in account pill -->
          <div v-if="currentUser" class="flex items-center justify-between gap-3 bg-elevated rounded-xl px-4 py-3 border border-default">
            <div class="flex items-center gap-2.5 min-w-0">
              <UAvatar :alt="currentUser.name || currentUser.email || ''" size="xs" class="shrink-0" />
              <span class="text-sm font-medium text-default truncate">{{ currentUser.name || currentUser.email }}</span>
            </div>
            <NuxtLink
              :href="`/oauth/login${$route.fullPath.slice($route.path.length)}`"
              class="text-xs text-primary shrink-0 hover:underline"
            >
              Not you?
            </NuxtLink>
          </div>

          <!-- Permission groups -->
          <div class="space-y-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-dimmed">
              You agree that <span class="text-default">{{ clientName || 'this app' }}</span> will be able to:
            </p>

            <div
              v-for="group in permissionGroups"
              :key="group.title"
              class="flex items-start gap-3"
            >
              <div class="w-8 h-8 rounded-lg bg-elevated border border-default flex items-center justify-center shrink-0 mt-0.5">
                <UIcon :name="group.icon" class="w-4 h-4 text-default" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-default">{{ group.title }}</p>
                <ul class="mt-1 space-y-0.5">
                  <li
                    v-for="item in group.items"
                    :key="item"
                    class="text-sm text-muted flex items-start gap-1.5"
                  >
                    <span class="text-dimmed mt-0.5 shrink-0">•</span>
                    {{ item }}
                  </li>
                </ul>
              </div>
            </div>
          </div>

        </div>

        <template #footer>
          <div class="flex flex-col gap-3">
            <UAlert v-if="error" color="error" variant="soft" :description="error" />

            <UButton
              id="oauth-consent-agree"
              block
              size="lg"
              :loading="accepting"
              :disabled="denying"
              @click="accept"
            >
              Agree
            </UButton>

            <button
              id="oauth-consent-cancel"
              class="w-full text-sm text-muted hover:text-default transition-colors text-center py-1"
              :disabled="accepting"
              @click="deny"
            >
              <span v-if="denying" class="opacity-60">Cancelling…</span>
              <span v-else>Cancel</span>
            </button>

            <div class="border-t border-default pt-3 space-y-1.5">
              <p class="text-xs text-dimmed text-center">
                You can remove this access at any time in your
                <NuxtLink href="/dashboard" class="underline underline-offset-2 hover:text-default transition-colors">account settings</NuxtLink>.
              </p>
              <p class="text-xs text-dimmed text-center">
                For more information about how {{ clientName || 'this app' }} uses your data, see KrabiClaw's
                <NuxtLink href="/privacy" class="underline underline-offset-2 hover:text-default transition-colors">privacy policy</NuxtLink>.
              </p>
            </div>
          </div>
        </template>
      </UCard>

    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false, auth: false })

useSeoMeta({ robots: 'noindex, nofollow' })

const route = useRoute()

// ── Client metadata ───────────────────────────────────────────────────────────
const clientName = ref('')
const clientIcon = ref(null)
const currentUser = ref(null)

onMounted(async () => {
  // Fetch registered client name / icon
  const clientId = route.query.client_id
  if (clientId && typeof clientId === 'string') {
    try {
      const data = await $fetch('/api/auth/oauth2/public-client-prelogin', {
        method: 'POST',
        body: { client_id: clientId, oauth_query: window.location.search.slice(1) },
      })
      if (data?.client_name) clientName.value = data.client_name
      if (data?.logo_uri) clientIcon.value = data.logo_uri
    } catch {
      // Non-fatal — fall back to generic copy
    }
  }

  // Fetch current session to show "signed in as" pill
  try {
    const session = await authClient.getSession()
    if (session?.data?.user) currentUser.value = session.data.user
  } catch {
    // No session — pill stays hidden
  }
})

// ── Permission groups ─────────────────────────────────────────────────────────
// Map scopes → grouped human-readable permissions (Spotify-style)
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

  if (scopes.has('offline_access')) {
    groups.push({
      icon: 'i-lucide-refresh-cw',
      title: 'Stay connected over time',
      items: ['Maintain access without asking you to sign in again'],
    })
  }

  // Passthrough for any unrecognised scopes
  const known = new Set(['openid', 'tenant', 'offline_access'])
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
