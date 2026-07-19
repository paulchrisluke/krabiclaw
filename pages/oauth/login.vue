<template>
  <div class="min-h-screen flex items-center justify-center bg-(--ui-bg) px-4 py-12">
    <div class="w-full max-w-sm">

      <!-- App connecting banner -->
      <div v-if="clientName" class="flex items-center justify-center gap-3 mb-8">
        <div class="w-9 h-9 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
          <img v-if="clientIcon" :src="clientIcon" :alt="clientName" class="w-full h-full object-cover" />
          <SayaIcon v-else name="link" class="w-4 h-4 text-muted" />
        </div>
        <SayaIcon name="arrow-right-left" class="w-4 h-4 text-dimmed" />
        <div class="w-9 h-9 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
          <img src="/favicon-96x96.png" alt="KrabiClaw" class="w-full h-full object-cover" />
        </div>
      </div>

      <div class="rounded-lg border border-default bg-default shadow-xl">
        <div class="border-b border-default px-6 py-5">
          <div class="text-center py-1">
            <h1 class="text-xl font-bold text-default">
              {{ existingSession ? 'Connect your account' : 'Sign in to connect' }}
            </h1>
            <p class="text-sm text-muted mt-1">
              <span v-if="clientName">
                <span class="font-semibold text-default">{{ clientName }}</span> is requesting access to KrabiClaw
              </span>
              <span v-else>Sign in to grant access to an external application.</span>
            </p>
          </div>
        </div>

        <div class="px-6 py-5">
          <!-- Already signed in — confirm account or switch -->
          <div v-if="existingSession" class="space-y-4 py-1">
            <div class="flex items-center gap-3 rounded-xl border border-default bg-elevated px-4 py-3">
              <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-default">
                {{ accountInitial }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-default truncate">{{ existingSession.name || 'Your account' }}</p>
                <p class="text-xs text-muted truncate">{{ existingSession.email }}</p>
              </div>
              <SayaIcon name="check-circle" class="w-4 h-4 text-green-500 shrink-0" />
            </div>

            <PlatformButton block :loading="loading" @click="continueWithSession">
              Continue as {{ existingSession.name?.split(' ')[0] || 'this account' }}
            </PlatformButton>

            <div class="flex items-center gap-3">
              <div class="flex-1 h-px bg-default" />
              <span class="text-[11px] text-dimmed uppercase tracking-widest">or</span>
              <div class="flex-1 h-px bg-default" />
            </div>

            <PlatformButton variant="ghost" size="sm" block @click="switchAccount">
              Sign in with a different account
            </PlatformButton>
          </div>

          <!-- No session / switch mode — show sign-in options -->
          <div v-else class="space-y-3 py-1">
            <div v-if="error" role="alert" class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{{ error }}</div>

            <AuthGoogleAuthButton :loading="loading || authLoading" @activate="handleGoogleSignIn" />

            <!-- Divider -->
            <div class="flex items-center gap-3 py-1">
              <div class="flex-1 h-px bg-default" />
              <span class="text-[12px] text-dimmed uppercase tracking-[0.18em]">or</span>
              <div class="flex-1 h-px bg-default" />
            </div>

            <AuthPhoneOtpForm verify-label="Verify and sign in" @verified="finishOAuthPhoneSignIn" />
          </div>
        </div>

        <div class="border-t border-default px-6 py-4">
          <p class="text-center text-xs text-dimmed">
            You can remove this access at any time from your account settings.
          </p>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { oauthContinuationDestination } from '~/shared/auth/oauth-login'

definePageMeta({ layout: false, auth: false })

useSeoMeta({ robots: 'noindex, nofollow' })

const route = useRoute()
const oauthPrompt = computed(() =>
  typeof route.query.prompt === 'string' ? route.query.prompt : ''
)
const isSelectAccountFlow = computed(() =>
  oauthPrompt.value.split(' ').includes('select_account')
)

// ── Client metadata ───────────────────────────────────────────────────────────
const clientName = ref('')
const clientIcon = ref(null)
const { user: sessionUser } = await useAuthSession()
const existingSession = ref(sessionUser.value)

onMounted(async () => {
  // 1. Fetch registered client name / icon for the banner
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

})

// ── Existing session state ────────────────────────────────────────────────────
const loading = ref(false)
const accountInitial = computed(() =>
  (existingSession.value?.name || existingSession.value?.email || '?').charAt(0).toUpperCase()
)

/**
 * User confirms they want to proceed with their current account.
 * Route back through the authorize endpoint so Better Auth can re-run the
 * prompt/consent checks with the now-active session and handle prompt=consent
 * correctly.
 */
async function continueWithSession() {
  loading.value = true
  if (isSelectAccountFlow.value) {
    const { data, error: continueError } = await authClient.oauth2.continue({ selected: true })
    if (continueError) {
      error.value = continueError.message || 'Could not continue authorization.'
      loading.value = false
      return
    }
    const destination = oauthContinuationDestination(data)
    window.location.href = destination || `/api/auth/oauth2/authorize${window.location.search}`
    return
  }

  window.location.href = `/api/auth/oauth2/authorize${window.location.search}`
}

/**
 * User wants to sign in as a different account — sign out silently and show
 * the sign-in form.
 */
async function switchAccount() {
  try {
    await authClient.signOut()
  } catch {
    // Ignore sign-out errors
  }
  existingSession.value = null
}

// ── Sign-in options (no existing session) ────────────────────────────────────
const error = ref(null)

const { loading: authLoading, error: authError, signInWithGoogle } = useAuthOperation()
watch(authError, value => { error.value = value })
async function handleGoogleSignIn() {
  await signInWithGoogle()
}

function finishOAuthPhoneSignIn() {
  // The OAuth Provider plugin resumes its signed authorization state when the
  // phone verification response creates the session.
}
</script>
