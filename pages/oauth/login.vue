<template>
  <div>

    <!-- App connecting banner -->
    <div v-if="clientName" class="flex items-center justify-center gap-3 mb-8">
      <div class="w-9 h-9 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
        <img v-if="clientIcon" :src="clientIcon" :alt="clientName" class="w-full h-full object-cover" />
        <SayaIcon v-else name="link" class="w-4 h-4 text-muted" />
      </div>
      <SayaIcon name="arrow-right-left" class="w-4 h-4 text-dimmed" />
      <div class="w-9 h-9 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
        <img src="/platform/apple-touch-icon.png" alt="KrabiClaw" class="w-full h-full object-cover" />
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
        <!-- Above the branch: continueWithSession and switchAccount both fail
             while the signed-in branch is showing, and an alert inside the
             signed-out branch would never render those. -->
        <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-3" />

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

          <UButton block size="lg" :loading="loading" @click="continueWithSession">
            Continue as {{ existingSession.name?.split(' ')[0] || 'this account' }}
          </UButton>

          <USeparator label="or" />

          <UButton color="neutral" variant="ghost" size="sm" block @click="switchAccount">
            Sign in with a different account
          </UButton>
        </div>

        <!-- No session / switch mode — show sign-in options -->
        <div v-else class="space-y-3 py-1">
          <AuthGoogleButton label="Sign in with Google" :loading="loading || authLoading" @activate="handleGoogleSignIn" />
          <AuthWhatsAppButton label="Sign in with WhatsApp" :disabled="loading || authLoading" @activate="showPhone = !showPhone" />
          <AuthPhoneOtpForm v-if="showPhone" verify-label="Verify and sign in" @verified="finishOAuthPhoneSignIn" />

          <USeparator label="or" />

          <AuthEmailSignInForm :callback-url="oauthAuthorizeUrl" @verification-required="showVerification" />

          <div v-if="verificationEmail" class="rounded-xl border border-default p-3 space-y-2">
            <p class="text-sm text-muted">Verify your email before signing in.</p>
            <p v-if="verificationResent" role="status" class="text-sm text-green-600">Verification email sent to {{ verificationEmail }}.</p>
            <UButton color="neutral" variant="outline" block :loading="resendingVerification" @click="resendVerification">Resend verification</UButton>
          </div>

        </div>
      </div>

      <div class="border-t border-default px-6 py-4">
        <p class="text-center text-xs text-dimmed">
          You can remove this access at any time from your account settings.
        </p>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { fetchOAuthClientPrelogin, oauthContinuationDestination } from '~/shared/auth/oauth-login'

definePageMeta({ layout: 'access', auth: false })

useSeoMeta({ robots: 'noindex, nofollow' })

const route = useRoute()
const oauthPrompt = computed(() =>
  typeof route.query.prompt === 'string' ? route.query.prompt : ''
)
const isSelectAccountFlow = computed(() =>
  oauthPrompt.value.split(' ').includes('select_account')
)
const oauthAuthorizeUrl = computed(() => `/api/auth/oauth2/authorize${route.fullPath.slice(route.path.length)}`)

// ── Client metadata ───────────────────────────────────────────────────────────
const clientName = ref<string | null>(null)
const clientIcon = ref<string | null>(null)
const { user: sessionUser } = await useAuthSession()
const existingSession = ref(sessionUser.value)

onMounted(async () => {
  // The banner names the app requesting access. With no client to look up, or
  // a lookup that fails, the banner is omitted and the generic copy stands.
  const client = await fetchOAuthClientPrelogin(route.query.client_id, window.location.search.slice(1))
  clientName.value = client?.clientName ?? null
  clientIcon.value = client?.logoUri ?? null
})

// ── Existing session state ────────────────────────────────────────────────────
const loading = ref(false)
const showPhone = ref(false)
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
  error.value = null
  try {
    await authClient.signOut()
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not sign out. Please try again.')
    return
  }
  existingSession.value = null
}

// ── Sign-in options (no existing session) ────────────────────────────────────
const error = ref<string | null>(null)

const { loading: authLoading, error: authError, signInWithGoogle } = useAuthOperation()
watch(authError, value => { error.value = value })
async function handleGoogleSignIn() {
  await signInWithGoogle()
}

function finishOAuthPhoneSignIn() {
  // The OAuth Provider plugin resumes its signed authorization state when the
  // phone verification response creates the session.
}

// ── Email verification recovery (mirrors pages/login.vue) ───────────────────
const verificationEmail = ref('')
const resendingVerification = ref(false)
const verificationResent = ref(false)

function showVerification(email: string) {
  verificationEmail.value = email
  verificationResent.value = false
}

async function resendVerification() {
  if (!verificationEmail.value || resendingVerification.value) return
  resendingVerification.value = true
  error.value = null
  verificationResent.value = false
  try {
    const result = await authClient.sendVerificationEmail({
      email: verificationEmail.value,
      callbackURL: oauthAuthorizeUrl.value,
    })
    if (result?.error) error.value = result.error.message || 'Could not resend verification email.'
    else verificationResent.value = true
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not resend verification email.')
  } finally {
    resendingVerification.value = false
  }
}
</script>
