<template>
  <div>

      <!-- Header -->
      <div class="mb-6">
        <img src="/krabi-claw-logo-96.webp" alt="KrabiClaw Logo" width="32" height="32" class="h-8 mb-4">
        <h1 class="text-2xl font-bold text-default tracking-tight mt-0.5">
          {{ clientName || 'This app' }} wants to access your KrabiClaw Account.
        </h1>
      </div>

      <!-- Signed-in account -->
      <div v-if="currentUser" class="mb-6">
        <p class="text-sm text-muted">
          Logged in as
          <span v-if="currentUser.name" class="text-default font-medium">{{ currentUser.name }} · </span>
          <span class="text-default font-medium">{{ currentUser.email }}</span>.
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
            <PlatformIcon :name="group.icon" class="size-5 text-default shrink-0 mt-0.5" />
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
      <div v-if="error" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{{ error }}</div>

      <PlatformButton id="oauth-consent-agree" size="lg" block :loading="accepting" :disabled="denying || switchingAccount" @click="accept">
        Agree
      </PlatformButton>

      <PlatformButton id="oauth-consent-cancel" variant="ghost" size="sm" block class="mt-3" :loading="denying" :disabled="accepting || switchingAccount" @click="deny">
        Cancel
      </PlatformButton>

      <!-- Legal footnotes -->
      <div class="mt-6 space-y-2">
        <p class="text-xs text-dimmed">
          You can remove this access at any time in your
          <NuxtLink href="/dashboard/account/profile" class="underline underline-offset-2 hover:text-default transition-colors">account settings</NuxtLink>.
        </p>
        <p class="text-xs text-dimmed">
          To learn more about how {{ clientName || 'this app' }} collects, uses, shares and protects your personal data please read
          <span class="font-medium">{{ clientName ? `${clientName}'s` : "the App's" }} Privacy Policy</span>.
        </p>
      </div>

  </div>
</template>

<script setup lang="ts">
import { $fetch } from 'ofetch'
import type { PlatformIconName } from '~/components/platform/PlatformIcon.vue'
import { authClient } from '~/lib/auth-client'
import { fetchOAuthClientPrelogin, oauthContinuationDestination } from '~/shared/auth/oauth-login'

definePageMeta({ layout: 'access', auth: false })

useSeoMeta({ robots: 'noindex, nofollow' })

const route = useRoute()

// ── Client metadata ───────────────────────────────────────────────────────────
const clientName = ref<string | null>(null)
const { user: currentUser } = await useAuthSession()

onMounted(async () => {
  const client = await fetchOAuthClientPrelogin(route.query.client_id, window.location.search.slice(1))
  clientName.value = client?.clientName ?? null
})

// ── Permission groups ─────────────────────────────────────────────────────────
const requestedScopes = computed(() => {
  const raw = route.query.scope
  if (!raw || typeof raw !== 'string') return ['openid', 'tenant']
  return raw.split(' ').filter(Boolean)
})

const permissionGroups = computed(() => {
  const scopes = new Set(requestedScopes.value)
  const groups: Array<{ icon: PlatformIconName, title: string, items: string[] }> = []

  if (scopes.has('openid')) {
    groups.push({
      icon: 'fingerprint',
      title: 'Verify your identity',
      items: ['Confirm you are who you say you are'],
    })
  }

  if (scopes.has('tenant')) {
    groups.push({
      icon: 'layout-dashboard',
      title: 'Access your KrabiClaw workspace',
      items: [
        'Read and update your site content, menus, and media',
        'Manage locations, reviews, and Q&A',
        'Submit and track work requests',
      ],
    })
  }

  // We hide offline_access from the UI (matching Spotify's transparent refresh token behavior)

  const known = new Set(['openid', 'tenant', 'offline_access'])
  const unknown = [...scopes].filter(s => !known.has(s))
  if (unknown.length) {
    groups.push({
      icon: 'key',
      title: 'Additional permissions',
      items: unknown,
    })
  }

  return groups
})

// ── Actions ───────────────────────────────────────────────────────────────────
const accepting = ref(false)
const denying = ref(false)
const error = ref<string | null>(null)
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
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not sign out. Please try again.')
    switchingAccount.value = false
    return
  }
  window.location.href = `/oauth/login${route.fullPath.slice(route.path.length)}`
}

async function submitConsent(accept: boolean) {
  error.value = null
  try {
    const result = await $fetch('/api/auth/oauth2/consent', {
      method: 'POST',
      body: { accept, oauth_query: window.location.search.slice(1) },
    })
    const destination = oauthContinuationDestination(result)
    if (!destination) {
      error.value = 'The authorization server did not send us anywhere to continue. Start the connection again from the app.'
      return
    }
    window.location.href = destination
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Something went wrong. Please try again.')
  }
}

async function accept() {
  if (switchingAccount.value || denying.value || accepting.value) return
  accepting.value = true
  try {
    await submitConsent(true)
  } finally {
    accepting.value = false
  }
}

async function deny() {
  if (switchingAccount.value || accepting.value || denying.value) return
  denying.value = true
  try {
    await submitConsent(false)
  } finally {
    denying.value = false
  }
}
</script>
